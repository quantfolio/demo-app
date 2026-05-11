const base_url = "https://api.test.deepalpha.dev";

const endpoints = {
    login: "/v1/auth/token",
};

type Token = {
    access_token: string;
};

async function login(): Promise<Token> {
    const url = `${base_url}${endpoints.login}`;

    const payload = {
        "client_id": Bun.env.CLIENT_ID,
        "client_secret": Bun.env.CLIENT_SECRET,
        "grant_type": "client_credentials"
    };

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`login failed: ${res.status} ${res.statusText}\n${body}`);
    }

    return (await res.json()) as Token;
}

const token = await login();
console.log(token.access_token);
