# Meraki Captive Portal with Azure Active Directory 
This Node.js app was created to facilitate the authorization of users registered on an Azure Active Directory with Meraki wireless infrastructures. Instead of using a RADIUS server for the authentication, you can spin up a web server that will be serving as your Captive Portal, which will then authenticate the user using OAuth

## References
This application and the step by step below were created / cloned based on the code provided by Microsoft, hosted [here](https://learn.microsoft.com/en-us/azure/active-directory/develop/tutorial-v2-nodejs-webapp-msal). Additionally, the information available at Meraki's [documentation](https://create.meraki.io/build/captive-portal-with-client-side-javascript/) about building your own JavaScript captive portal or the [click-through-api](https://developer.cisco.com/meraki/captive-portal-api/click-through-api/) description. This [one](https://developer.cisco.com/meraki/build/captive-portal-with-client-side-javascript/) is also helpful.

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
In order to work with Meraki's captive portal, your server will need to run on a publicly available IP, i.e., you will need to host it out in the Internet. There are several alternatives to address this. For development purposes, you can use ngrok, which will create introspectable tunnels to your localhost. For production environments, you can use Heroku, which is a PAAS that has a free tier of service or Azure Webapp which also have a Free plan.
* Getting Started on Heroku with Node.js - [Getting started guide](https://devcenter.heroku.com/articles/getting-started-with-nodejs#introduction)
* Quickstarts - [Deploy a Node.js web app in Azure](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs?tabs=linux&pivots=development-environment-azure-portal)
* ngrok - [How it works](https://ngrok.com/product)

Once you have the public URL where the server will run, take note of that. It will be referred as `https://public-url.example.com` in this document.

## Meraki Dashboard Setup
The steps below were copied from Meraki's official documentation [Configuring a Custom-Hosted Splash Page
](https://documentation.meraki.com/General_Administration/Cross-Platform_Content/Configuring_a_Custom-Hosted_Splash_Page_to_Work_with_the_Meraki_Cloud)

### Configure Access Control
* In Dashboard, navigate to Configure > Access control.
* Select the SSID you want to configure from the SSID drop-down. 
* Under Network access > Association requirements, choose "Open", "WPA2," or "WEP." 
* Under Network access > Network sign-on method, choose "Click-through splash page" or "Sign-on splash page." 
* Enable walled garden (located under Network access > Walled garden) and enter the public IP address or domain name of your web server.
* Click "Save Changes." 

### Enabling a Custom-Hosted Splash page on the Meraki Cloud
* Navigate to Configure > Splash page
* Select the SSID you want to configure from the SSID drop-down.
* Under Custom splash URL select the radio button Or provide a URL where users will be redirected:
* Type the URL of your custom splash page:
	`https://public-url.example.com`
* Click Save Changes.


## Azure Setup
### Step 1: Register an Azure AD Tenant
To use this sample you will need a Windows Azure Active Directory Tenant. If you're not sure what a tenant is or how you would get one, read [What is an Azure AD tenant](http://technet.microsoft.com/library/jj573650.aspx)? or [Sign up for Azure as an organization](http://azure.microsoft.com/en-us/documentation/articles/sign-up-organization/). These docs should get you started on your way to using Windows Azure AD.

### Step 2: Create an App Registration
Create an `App Registration` object
* In Manage -> Authentication:
  * Add a redirect URI  `https://public-url.example.com/auth/openid/return`. You can add many, if you access it from CNAME in another domain.
  * Add the logout URL `https://public-url.example.com/logout`
  * Check the box `ID tokens (used for implicit and hybrid flows)`
* In Manage -> Certificates & secrets:
  * Add a new `Client secret`
  * Careful, the max age in 24 months... Don't forget to renew before expiration ;-)
* In Manage -> API permissions:
  * Grant the `Microsoft.Graph` `User.Read` permission.

### Step 3: Write down the following needed parameters

* TENANT_ID: your `Tenant` ID
* CLIENT_ID: your `App Registration` ID
* CLIENT_SECRET: your `Client secret` value

## This APP setup
### Step 1: Download node.js for your platform
To successfully use this sample, you need a working installation of Node.js.

### Step 2: Download the Sample application and modules
Next, clone the sample repo and install the NPM.
From your shell or command line:
```bash
git clone git@github.com:spie-ics-ag/meraki2azure_ad.git
cd meraki2azure_ad
npm install
```

### Step 3: Configure your server
Some mandatory parameters are read from the environment variables. You need to export them as follow before starting your app:
```bash
export CLOUD_INSTANCE=https://login.microsoftonline.com/
export AZ_TENANT_ID=11111111-1111-1111-1111-111111111111
export AZ_CLIENT_ID=00000000-0000-0000-0000-000000000000
export AZ_CLIENT_SECRET=xxxxx~xxxxxx~xxxxxxxxxxxxxxxxxxxxxxxxxxx
export REDIRECT_URL=https://public-url.example.com
export SESSION_SECRET=<A_Secret_Key>
```

Optionally, if you want to change the CSS and the logos, you can override the `public` directory path to your customized path, with: 
```bash
export PUBLIC_DIR_PATH=custom_public
```

Note: the `PUBLIC_DIR_PATH` is relative to the `src` folder. This is useful for Azure Storage Mount

You can also change portal default title and default SSID with:
```bash
export PORTAL_TITLE="Guest Captive Portal"
export SSID="Guest WiFi"
```

### Step 4: Run the application
Run the app. Use the following command in terminal.
```bash
npm run start
```

## You're done!
You will have a server successfully running on `https://public-url.example.com` (or on `http://localhost:3000` if you are testing it locally).

### Testing before the Meraki config is done
You can test the application without the Meraki config (for example, to validate the connection and authentication to the Azure AD is working properly). For this, just pass a fake `base_grant_url` parameter to your server:
`https://public-url.example.com?base_grant_url=whatever`
You will get the Login page, will be able to login to Azure AD, but the redirection will fail (as you didn't pass a valid base_grant_url). But if you go again to `https://public-url.example.com/auth/signin`, you'll see you are successfully logged in.

## User Experience
When the user selects the configured wireless SSID, a splash page will be shown prompting for their Azure AD Credentials.