import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { GrepService } from './grep-service';

// @ts-ignore - virtual module
import { files } from 'virtual:webcontainer-files';

interface WebContainerContext {
  loaded: boolean;
  grepService?: GrepService;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer =
    import.meta.hot?.data.webcontainer ??
    Promise.resolve()
      .then(() => {
        return WebContainer.boot({ workdirName: WORK_DIR_NAME });
      })
      .then(async (webcontainer) => {
        webcontainerContext.loaded = true;
        await webcontainer.mount(files);

        // Start the grep service
        const grepService = new GrepService(webcontainer);
        await grepService.start();
        webcontainerContext.grepService = grepService;

        return webcontainer;
      });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}
