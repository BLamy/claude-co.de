import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';

export async function loader({ request, params }: LoaderFunctionArgs) {
  return handleProxy(request, params);
}

export async function action({ request, params }: ActionFunctionArgs) {
  return handleProxy(request, params);
}

// Handle OPTIONS requests for CORS preflight
export async function options({ request, params }: LoaderFunctionArgs) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    }
  });
}

async function handleProxy(request: Request, params: LoaderFunctionArgs['params']) {
  // Get the full path from the splat route
  const path = params['*'] || '';
  
  // Check for WebContainer proxy headers
  const targetHost = request.headers.get('x-stackblitz-host') || request.headers.get('x-client-host');
  const authToken = request.headers.get('x-stackblitz-authorization');
  const expectedToken = '1234567890';
  
  // If no target host, not a proxy request
  if (!targetHost) {
    return new Response('Not Found', { status: 404 });
  }
  
  // Validate auth token
  if (authToken !== expectedToken) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    // Construct the target URL
    const url = new URL(request.url);
    const targetUrl = `${targetHost}/${path}${url.search}`;
    
    console.log('Proxying request:', {
      origionalUrl: request.url,
      method: request.method,
      targetUrl,
      path,
      targetHost
    });
    
    // Clone headers and clean them up
    const headers = new Headers();
    
    for (const [key, value] of request.headers.entries()) {
      if (key.startsWith('x-stackblitz-') || 
          key === 'host' || 
          key.startsWith('cf-') ||
          key === 'origin' ||
          key === 'referer') {
        continue;
      }
      
      // Handle x-client-* headers by removing the prefix
      if (key.startsWith('x-client-')) {
        const actualKey = key.substring(9); // Remove 'x-client-' prefix
        headers.set(actualKey, value);
      } else {
        headers.set(key, value);
      }
    }
    
    // Special handling for authorization header from x-client-authorization
    const clientAuth = request.headers.get('x-client-authorization');
    if (clientAuth && !headers.has('authorization')) {
      headers.set('authorization', clientAuth);
    }
    
    // Get the body if it exists
    let body = undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        body = await request.arrayBuffer();
        if (body.byteLength === 0) {
          body = undefined;
        }
      } catch (e) {
        // No body or error reading body
        body = undefined;
      }
    }
    
    // Make the proxied request
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'follow',
    });

    // Log equivalent curl command for debugging
    const curlHeaders = [];
    for (const [key, value] of headers.entries()) {
      curlHeaders.push(`-H '${key}: ${value}'`);
    }
    
    let curlCommand = `curl '${targetUrl}' \\\n  -X ${request.method}`;
    if (curlHeaders.length > 0) {
      curlCommand += ' \\\n  ' + curlHeaders.join(' \\\n  ');
    }
    
    if (body && body.byteLength > 0) {
      try {
        const bodyText = new TextDecoder().decode(body);
        // For JSON bodies, format nicely
        if (headers.get('content-type')?.includes('application/json')) {
          const jsonBody = JSON.parse(bodyText);
          curlCommand += ` \\\n  -d '${JSON.stringify(jsonBody)}'`;
        } else {
          curlCommand += ` \\\n  -d '${bodyText}'`;
        }
      } catch (e) {
        curlCommand += ` \\\n  --data-binary @-`;
      }
    }
    
    console.log('Equivalent curl command:', curlCommand);
    
    // Create response with proper headers
    const responseHeaders = new Headers(response.headers);
    
    // Add CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('Access-Control-Max-Age', '86400');
    
    // Read the response body
    const responseBody = await response.arrayBuffer();
    
    // Debug: log the actual response content if it's JSON
    if (responseHeaders.get('content-type')?.includes('application/json') && responseBody.byteLength > 0) {
      try {
        const responseText = new TextDecoder().decode(responseBody);
        console.log('Response details:', {
          status: response.status,
          statusText: response.statusText,
          contentLength: responseHeaders.get('content-length'),
          contentType: responseHeaders.get('content-type'),
          bodySize: responseBody.byteLength,
          body: responseText.substring(0, 500) // Limit log output
        });
      } catch (e) {
        console.log('Response is compressed or binary');
      }
    }
    
    // For JSON responses, parse and return using Remix's json helper
    if (responseHeaders.get('content-type')?.includes('application/json')) {
      try {
        const responseText = new TextDecoder().decode(responseBody);
        const jsonData = JSON.parse(responseText);
        return json(jsonData, {
          status: response.status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      } catch (e) {
        // If JSON parsing fails, return as text
        return new Response(new TextDecoder().decode(responseBody), {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': responseBody.byteLength.toString(),
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }
    
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Proxy Error', { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}