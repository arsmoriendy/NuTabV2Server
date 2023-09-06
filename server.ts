const env: Map<string, string> = new Map;

let requiredEnvComplete;
[
  // relevant and required environment variables
  "PORT",
  "TOKEN_REDIRECT_URI",
  "CLIENT_SECRET"
].forEach(e => {
  const val = Bun.env[e];
  if (val === undefined) {
    console.error(`Please define "${e}" environment variable`);
    requiredEnvComplete = false;
    return
  }
  env.set(e, val)
})
if (requiredEnvComplete === false) process.exit(1);

[
  // relevant but not required environment variables
  "URL_PREFIX"
].forEach(e => {
  const val = Bun.env[e];
  if (val === undefined) return;
  env.set(e, val);
});

const stateTokenMap: Map<string, { accessToken: string, refreshToken: string }> = new Map([]);

const urlPrefix = env.get("URL_PREFIX") ?? "";

Bun.serve({
  port: env.get("PORT"),
  async fetch(req) {
    const reqUrl = new URL(req.url);
    const reqSearchParams = reqUrl.searchParams;
    const state: string | null = reqSearchParams.get("state");

    switch (reqUrl.pathname) {
      case urlPrefix + "/auth":

        // check url params
        const code: string | null = reqSearchParams.get("code");
        if (state === null || code === null) {
          return new Response(`Bad URL parameters`, { status: 403 });
        }

        // get token
        const tokenUrl = new URL("https://id.twitch.tv/oauth2/token?client_id=yffbv3l3u4erjnr9q26nl43qjqw6xz&grant_type=authorization_code")
        tokenUrl.searchParams.set("code", code)
        tokenUrl.searchParams.set("redirect_uri", env.get("TOKEN_REDIRECT_URI")!)
        tokenUrl.searchParams.set("client_secret", env.get("CLIENT_SECRET")!)
        const tokenResponse = await fetch(tokenUrl, { method: "POST" });
        if (tokenResponse.status !== 200) {
          return new Response(`Failed to retreive token`, { status: 502 });
        }

        const tokenResponseJSON: {
          "access_token": string,
          "expires_in": number,
          "refresh_token": string,
          "scope": string[],
          "token_type": string
        } = await tokenResponse.json();

        stateTokenMap.set(state, {
          accessToken: tokenResponseJSON.access_token,
          refreshToken: tokenResponseJSON.refresh_token
        })


        return new Response(`Success`);

      case urlPrefix + "/token":
        const headers = {
          "Access-Control-Allow-Origin": "*"
        }

        // check state
        if (state === null) {
          return new Response(`Bad URL parameters`, { status: 403, headers });
        }

        // check state valid
        const token = stateTokenMap.get(state)
        if (token === undefined) {
          return new Response(`State not found`, { status: 404, headers });
        }

        stateTokenMap.delete(state)

        return new Response(JSON.stringify(token), {
          headers: {
            "Content-Type": "application/json",
            ...headers
          }
        });

      default:
        return new Response(`Not found`, { status: 404 })
    }
  },
});
