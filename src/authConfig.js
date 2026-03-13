/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
 */
'use strict';

//ensure required environment variables are set
const required = [
    'AZ_CLIENT_ID',
    'AZ_TENANT_ID',
    'AZ_CLIENT_SECRET',
    'REDIRECT_URL',
];
for (const key of required) {
    if (!process.env[key]) {
        throw new Error(`${key} environment variable is required`);
    }
}

/**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL Node configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/configuration.md
 */
const msalConfig = {
    auth: {
        clientId: process.env.AZ_CLIENT_ID,
        authority: new URL(
            process.env.AZ_TENANT_ID,
            process.env.CLOUD_INSTANCE || 'https://login.microsoftonline.com'
        ).href,
        clientSecret: process.env.AZ_CLIENT_SECRET,
    },
    system: {
        loggerOptions: {
            loggerCallback(_loglevel, message, _containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: process.env.NODE_ENV === 'development' ? 3 : 1,
        },
    },
};

const redirectUri = new URL('/auth/openid/return', process.env.REDIRECT_URL)
    .href;
const postLogoutRedirectUri = new URL(process.env.REDIRECT_URL).href;

if (process.env.NODE_ENV === 'development') {
    console.debug('MSAL authority:', msalConfig.auth.authority);
}

module.exports = {
    msalConfig,
    redirectUri,
    postLogoutRedirectUri,
};
