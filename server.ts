const env: Map<string, string> = new Map;
let envIsComplete = true;
[
  // relevant environment variables
  "PORT",
  "TOKEN_REDIRECT_URI",
  "CLIENT_SECRET",
  "URL_PREFIX"
].forEach(e => {
  const val = Bun.env[e];
  if (val === undefined) {
    console.error(`Please define "${e}" environment variable`);
    envIsComplete = false;
    return
  }
  env.set(e, val)
})
if (!envIsComplete) process.exit(1)

const stateTokenMap: Map<string, { accessToken: string, refreshToken: string }> = new Map([]);

Bun.serve({
  port: env.get("PORT"),
  async fetch(req) {
    const reqUrl = new URL(req.url);
    const reqSearchParams = reqUrl.searchParams;
    const state: string | null = reqSearchParams.get("state");

    switch (reqUrl.pathname) {
      case env.get("URL_PREFIX") + "/auth":

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

      case env.get("URL_PREFIX") + "/token":
        // check state
        if (state === null) {
          return new Response(`Bad URL parameters`, { status: 403 });
        }

        // check state valid
        const token = stateTokenMap.get(state)
        if (token === undefined) {
          return new Response(`State not found`, { status: 404 });
        }

        stateTokenMap.delete(state)

        return new Response(JSON.stringify(token), {
          headers: {
            "Content-Type": "application/json"
          }
        });

      default:
        return new Response(`Not found`, { status: 404 })
    }
  },
});
