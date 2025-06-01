import { json, type MetaFunction } from '@remix-run/cloudflare';
import { useNavigate } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { getRecentProjects, type RecentProject } from '~/lib/stores/recent-projects';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { webcontainer } from '~/lib/webcontainer';
import { proxySettingsStore } from '~/lib/stores/settings';

export const meta: MetaFunction = () => {
  return [{ title: 'claude-co.de' }, { name: 'description', content: 'Development Environment' }];
};

export const loader = () => json({});

const ClaudeLogo = () => (
  <svg height="2.5rem" width="2.5rem" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
    <title>Claude</title>
    <path
      d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
      fill="#D97757"
    />
  </svg>
);

export default function Index() {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  // initialize webcontainer and CORS proxy setup
  useEffect(() => {
    // ensure webcontainer is initialized and CORS proxy settings are applied
    webcontainer
      .then(async (container) => {
        const proxySettings = proxySettingsStore.get();
        console.log(
          'Applying WebContainer CORS Auth Token:',
          proxySettings.corsAuthToken ? 'configured' : 'not configured',
        );
        container.internal.setCORSAuthToken(proxySettings.corsAuthToken);

        console.log('Applying WebContainer CORS Proxy:', proxySettings.corsProxy);
        container.internal.setCORSProxy(proxySettings.corsProxy);

        console.log('WebContainer and CORS proxy initialized successfully');
      })
      .catch((error) => {
        console.error('Failed to initialize WebContainer:', error);
      });
  }, []);

  useEffect(() => {
    const projects = getRecentProjects();
    setRecentProjects(projects);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // parse GitHub URL patterns
    const githubPattern = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/;
    const shortPattern = /^([^\/]+)\/([^\/]+)$/;

    let owner: string | null = null;
    let repo: string | null = null;

    const githubMatch = repoUrl.match(githubPattern);

    if (githubMatch) {
      owner = githubMatch[1];
      repo = githubMatch[2];
    } else {
      const shortMatch = repoUrl.match(shortPattern);

      if (shortMatch) {
        owner = shortMatch[1];
        repo = shortMatch[2];
      }
    }

    if (owner && repo) {
      navigate(`/github.com/${owner}/${repo}`);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
      }

      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <ClaudeLogo />
            <h1 className="text-5xl font-bold text-bolt-elements-textPrimary">claude-co.de</h1>
          </div>
          <p className="text-xl text-bolt-elements-textSecondary max-w-2xl mx-auto leading-relaxed">
            AI-powered development environment. Enter a GitHub repository URL to start coding with Claude's assistance.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card className="border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
              <CardHeader>
                <CardTitle className="text-2xl  text-bolt-elements-textPrimary flex items-center gap-2">
                  <svg className="w-6 h-6 text-bolt-elements-textSecondary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  Open Repository
                </CardTitle>
                <CardDescription className="text-bolt-elements-textSecondary">
                  Enter a GitHub repository URL or use the owner/repo format
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-3">
                    <Input
                      type="text"
                      placeholder="https://github.com/owner/repo or owner/repo"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      className="h-12 text-base bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor focus:border-[#D97757] transition-colors"
                      required
                    />
                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-medium bg-[#D97757] hover:bg-[#c5684a] text-white border-0 transition-colors"
                    >
                      Start Coding
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
              <CardHeader>
                <h3 className="font-semibold text-bolt-elements-textPrimary mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#D97757]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Features
                </h3>
                <ul className="space-y-3 text-sm text-bolt-elements-textSecondary">
                  <li className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-[#D97757] mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Instant repository cloning
                  </li>
                  <li className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-[#D97757] mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    AI-powered code assistance
                  </li>
                  <li className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-[#D97757] mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Browser-based environment
                  </li>
                  <li className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-[#D97757] mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Use Claude Max subscription
                  </li>
                </ul>
              </CardHeader>
            </Card>
          </div>
        </div>

        {recentProjects.length > 0 && (
          <Card className="border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2 text-bolt-elements-textPrimary">
                <svg
                  className="w-5 h-5 text-bolt-elements-textSecondary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Recent Projects
              </CardTitle>
              <CardDescription className="text-bolt-elements-textSecondary">
                Your recently visited repositories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {recentProjects.slice(0, 8).map((project) => (
                  <button
                    key={`${project.owner}/${project.repo}`}
                    onClick={() => navigate(`/github.com/${project.owner}/${project.repo}`)}
                    className="group w-full text-left p-4 rounded-lg border border-bolt-elements-borderColor hover:border-[#D97757] bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-bolt-elements-background-depth-3 rounded-lg flex items-center justify-center group-hover:bg-[#D97757] transition-colors">
                        <svg
                          className="w-5 h-5 text-bolt-elements-textSecondary group-hover:text-white transition-colors"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                      </div>
                      <svg
                        className="w-4 h-4 text-bolt-elements-textSecondary group-hover:text-[#D97757] transition-colors ml-auto"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-bolt-elements-textPrimary group-hover:text-[#D97757] transition-colors text-sm">
                        {project.owner}/{project.repo}
                      </div>
                      <div className="text-xs text-bolt-elements-textSecondary mt-1">
                        {formatDate(project.visitedAt)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}