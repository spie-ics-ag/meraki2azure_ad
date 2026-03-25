# Meraki Captive Portal with Azure Active Directory

This Node.js app was created to facilitate the authorization of users registered on an Azure Active Directory with Meraki wireless infrastructures. Instead of using a RADIUS server for the authentication, you can spin up a web server that will be serving as your Captive Portal, which will then authenticate the user using OAuth.

## References

This application and the step by step below were created / cloned based on the code provided by Microsoft, hosted [here](https://learn.microsoft.com/en-us/azure/active-directory/develop/tutorial-v2-nodejs-webapp-msal). Additionally, the information available at Meraki's [documentation](https://create.meraki.io/build/captive-portal-with-client-side-javascript/) about building your own JavaScript captive portal or the [click-through-api](https://developer.cisco.com/meraki/captive-portal-api/click-through-api/) description. This [one](https://developer.cisco.com/meraki/build/captive-portal-with-client-side-javascript/) is also helpful.

> **Note**: This application uses MSAL Node v5. Requires Node.js v20.19.0 or higher.

## Authentication Details

| Component | Value |
|-----------|-------|
| **Flow** | Authorization Code Flow with PKCE |
| **Client Type** | Confidential Client (`ConfidentialClientApplication`) |
| **Identity Provider** | Microsoft Entra ID (Azure AD) |
| **Response Mode** | `FORM_POST` |
| **PKCE Method** | S256 (SHA-256) |

## OAuth 2.0 Authorization Code Flow with PKCE
```
┌──────────┐      ┌──────────────┐      ┌─────────────┐      ┌─────────────────┐
│  User    │      │ Your App     │      │  Azure AD   │      │ Meraki Network  │
│ (Captive │      │ (Express)    │      │             │      │ Auth            │
│  Portal) │      │              │      │             │      │                 │
└────┬─────┘      └──────┬───────┘      └──────┬──────┘      └────────┬────────┘
     │                   │                     │                      │
     │ 1. Access network │                     │                      │
     │ ─────────────────>│                     │                      │
     │                   │                     │                      │
     │                   │ 2. Generate PKCE    │                      │
     │                   │    (verifier +      │                      │
     │                   │     challenge)      │                      │
     │                   │                     │                      │
     │ 3. Redirect to Azure AD                 │                      │
     │ <─────────────────│────────────────────>│                      │
     │                   │                     │                      │
     │ 4. User authenticates                   │                      │
     │ ───────────────────────────────────────>│                      │
     │                   │                     │                      │
     │ 5. Auth code (POST)                     │                      │
     │ <───────────────────────────────────────│                      │
     │ ─────────────────>│                     │                      │
     │                   │                     │                      │
     │                   │ 6. Exchange code    │                      │
     │                   │    + verifier       │                      │
     │                   │    for tokens       │                      │
     │                   │ ───────────────────>│                      │
     │                   │ <───────────────────│                      │
     │                   │                     │                      │
     │ 7. Redirect to Meraki grant URL         │                      │
     │ <─────────────────│─────────────────────────────────────────── >│
     │                   │                     │                      │
     │ 8. Network access granted               │                      │
     │ <───────────────────────────────────────────────────────────────│
```

## Why PKCE?

Even though you're using a **Confidential Client** (which has a client secret), PKCE adds an extra layer of security:
- Protects against authorization code interception
- Mitigates man-in-the-middle attacks
- Recommended by Microsoft for all OAuth flows

## Quick Start

In order to work with Meraki's captive portal, your server will need to run on a publicly available IP, i.e., you will need to host it out in the Internet. There are several alternatives to address this. For development purposes, you can use ngrok, which will create introspectable tunnels to your localhost. For production environments, you can use Azure App Service which offers various pricing tiers.

- Quickstarts - [Deploy a Node.js web app in Azure](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs?tabs=linux&pivots=development-environment-azure-portal)
- ngrok - [How it works](https://ngrok.com/product)

Once you have the public URL where the server will run, take note of that. It will be referred as `https://public-url.example.com` in this document.

## Meraki Dashboard Setup

The steps below were copied from Meraki's official documentation [Configuring a Custom-Hosted Splash Page](https://documentation.meraki.com/General_Administration/Cross-Platform_Content/Configuring_a_Custom-Hosted_Splash_Page_to_Work_with_the_Meraki_Cloud).

### Configure Access Control

- In Dashboard, navigate to Configure > Access control.
- Select the SSID you want to configure from the SSID drop-down.
- Under Network access > Association requirements, choose "Open", "WPA2," or "WEP."
- Under Network access > Network sign-on method, choose "Click-through splash page" or "Sign-on splash page."
- Enable walled garden (located under Network access > Walled garden) and enter the public IP address or domain name of your web server.
- Click "Save Changes."

### Enabling a Custom-Hosted Splash Page on the Meraki Cloud

- Navigate to Configure > Splash page
- Select the SSID you want to configure from the SSID drop-down.
- Under Custom splash URL select the radio button Or provide a URL where users will be redirected:
- Type the URL of your custom splash page: `https://public-url.example.com`
- Click Save Changes.

## Azure Setup

### Step 1: Register an Azure AD Tenant

To use this sample you will need a Microsoft Entra ID (Azure AD) Tenant. If you're not sure what a tenant is or how you would get one, read [What is an Azure AD tenant](http://technet.microsoft.com/library/jj573650.aspx) or [Sign up for Azure as an organization](http://azure.microsoft.com/en-us/documentation/articles/sign-up-organization/).

### Step 2: Create an App Registration

Create an `App Registration` object:

- In Manage -> Authentication:
  - Add a redirect URI `https://public-url.example.com/auth/openid/return`. You can add many, if you access it from a CNAME in another domain.
  - Add the logout URL `https://public-url.example.com/logout`
  - Check the box `ID tokens (used for implicit and hybrid flows)`
- In Manage -> Certificates & secrets:
  - Add a new `Client secret`
  - The max age is 24 months — don't forget to renew before expiration.
- In Manage -> API permissions:
  - Grant the `Microsoft.Graph` `User.Read` permission.

### Step 3: Note the following required parameters

- `TENANT_ID`: your Tenant ID
- `CLIENT_ID`: your App Registration ID
- `CLIENT_SECRET`: your Client secret value

## Application Setup

### Step 1: Install Node.js

Download and install Node.js v20.19.0 or higher from [nodejs.org](https://nodejs.org).

### Step 2: Clone the repository and install dependencies
```bash
git clone git@github.com:spie-ics-ag/meraki2azure_ad.git
cd meraki2azure_ad
npm install
```

### Step 3: Configure environment variables

The following environment variables are required:

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | Set to `production` in production environments |
| `AZ_TENANT_ID` | Yes | Your Azure AD Tenant ID |
| `AZ_CLIENT_ID` | Yes | Your App Registration (Client) ID |
| `AZ_CLIENT_SECRET` | Yes | Your App Registration Client Secret |
| `REDIRECT_URL` | Yes | Public base URL of your application |
| `SESSION_SECRET` | Yes | A strong random secret for session signing |
| `CLOUD_INSTANCE` | No | Azure AD endpoint (default: `https://login.microsoftonline.com/`) |
| `SESSION_TTL` | No | Session lifetime in seconds (default: `900`) |
| `PUBLIC_DIR_PATH` | No | Custom public directory path relative to `src/` |
| `PORTAL_TITLE` | No | Custom portal title (default: `Meraki Captive Portal for Azure Active Directory`) |
| `SSID` | No | SSID name displayed on the portal (default: `WiFi`) |

Export the required variables before starting:
```bash
export NODE_ENV=production
export CLOUD_INSTANCE=https://login.microsoftonline.com/
export AZ_TENANT_ID=11111111-1111-1111-1111-111111111111
export AZ_CLIENT_ID=00000000-0000-0000-0000-000000000000
export AZ_CLIENT_SECRET=xxxxx~xxxxxx~xxxxxxxxxxxxxxxxxxxxxxxxxxx
export REDIRECT_URL=https://public-url.example.com
export SESSION_SECRET=<A_Strong_Random_Secret>
```

### Step 4: Run the application
```bash
npm start
```

## Azure App Service Deployment

> **Important**: Ensure the following Application Settings are configured in your Azure App Service:

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | A strong random secret |
| `AZ_TENANT_ID` | Your Azure AD Tenant ID |
| `AZ_CLIENT_ID` | Your App Registration ID |
| `AZ_CLIENT_SECRET` | Your Client Secret |
| `REDIRECT_URL` | Your App Service URL |

Sessions are persisted to `/home/sessions` on Azure App Service Linux, which survives process restarts. ARR Affinity does not need to be enabled.

## Testing

You can test the authentication flow without a Meraki device by navigating to:
```
https://public-url.example.com/auth/signin?base_grant_url=https://eu.network-auth.com/splash/test/grant&user_continue_url=https://public-url.example.com
```

> **Note**: `base_grant_url` must be a valid `network-auth.com` domain URL. The redirect to Meraki will fail since this is a test URL, but you can verify the Azure AD authentication is working correctly by checking you are shown as authenticated after the flow completes.

For local development, you can use [ngrok](https://ngrok.com) to expose your local server over HTTPS, which is required for the OAuth callback.

## User Experience

When the user connects to the configured wireless SSID, a splash page will be shown prompting for their Microsoft (Azure AD) credentials. Once authenticated, the user is automatically granted access to the network.

## Security

This application implements the following security measures:

- **PKCE** (Proof Key for Code Exchange) on all authentication flows
- **CSRF protection** via state parameter validation on OAuth callback
- **Open redirect protection** — redirect URLs are validated against the Meraki `network-auth.com` domain
- **Single-use auth codes** — PKCE codes are cleared from session after use
- **Secure session cookies** — `httpOnly`, `secure`, `sameSite` configured per environment
- **Input validation** — all redirect URLs validated before use
- **Rate limiting** — 100 requests per 15 minutes per IP
