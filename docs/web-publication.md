# WEB-6: publish the web preview

The web application builds to static files in `apps/web/dist`. The Pages workflow
publishes only that directory. It does not publish repository sources, test
artifacts, API keys or a backend. The current interface remains an explicit
preview: route calculation and rehearsal are not connected.

## Enable publication

An administrator of the repository that will host the site performs this setup:

1. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
2. In **Settings → Environments → github-pages**, select **Selected branches and
   tags** and add a **branch** rule for the exact publishing branch. Preserve any
   existing reviewers or other protection rules.
3. In **Settings → Secrets and variables → Actions → Variables**, create the
   repository variable `PAGES_DEPLOY_BRANCH` with that same branch name.
4. Push a reviewed change containing `.github/workflows/pages.yml` to that branch.
   The workflow also supports a manual run when it is available on the default
   branch; select the configured publishing branch when starting it.
5. Open **Actions → Publish web preview**. After both jobs pass, the deployment's
   environment link gives the public URL. A project site normally uses
   `https://<owner>.github.io/<repository>/`; use GitHub's reported URL if a custom
   domain is configured.

The repository variable is intentionally unset by default. Forks and other
branches cannot publish through this workflow until their owner opts in. A pull
request runs the normal CI checks, not the deployment. Configure the environment
branch rule as well as the workflow variable: it independently restricts which
branch may obtain a deployment token.

The workflow runs on pushes, including a configured preview branch before it is
merged. This allows review on a fork without changing the upstream default branch
or bypassing its review process. Hosting the preview does not mean the card's
dependency or the app itself has been approved for release.

## Checks and permissions

Before upload, the build job runs `npm ci`, `npm run check`, `npm run build`, the
full WEB-1 browser suite, and `npm run test:e2e:pages`. The last command serves the
production build at `/milo/` and checks asset loading, reload, error recovery,
input preservation, both interface languages and axe in Chromium and WebKit.
Relative Vite asset URLs let the same artifact run below a repository path.

The build job has read-only repository access. Only the deployment job has
`pages: write` and `id-token: write`, using GitHub's short-lived credentials and
the `github-pages` environment. No personal token or application API key is needed.
Deployment waits for the successful build; failures leave the previously
published version available. Runs are serialized without cancelling a deployment
already in progress.

To check the actual published URL after deployment, run from the repository root:

```powershell
$env:MILO_PAGES_URL = 'https://<owner>.github.io/<repository>/'
npm run test:e2e:pages
Remove-Item Env:MILO_PAGES_URL
```

Include the trailing slash. These tests submit only a fixed sample to the current
local-state preview. They do not call a model or mapping service. Reassess the
live-test fixture before the app gains those integrations. Automated WebKit tests
do not replace VoiceOver on a physical iPhone, nor the remaining manual WEB-1
screen-reader checks.

## Failed publication, rollback and pausing

If the build fails, inspect the failing Actions step and its attached browser
trace. If deployment fails, check that Pages uses Actions and that the variable
and environment branch rule agree. Fix the cause before rerunning the failed job.
Do not broaden permissions or branch rules merely to make a deployment pass.

To roll back, revert the faulty change through the repository's normal review
process on its publishing branch; the same checks gate the replacement build.
To pause new publications, remove `PAGES_DEPLOY_BRANCH` and cancel any already
queued or running publication in Actions. Removing the variable alone does not
cancel a run already started. Pausing leaves the last successful site available;
unpublishing it is a separate Pages setting.

References: [GitHub's Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
and [deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
