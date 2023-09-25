/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
 */
'use strict';

require('dotenv').config({ path: '.env.dev' });

/**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL Node configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/configuration.md
 */
const msalConfig = {
    auth: {
        clientId: process.env.AZ_CLIENT_ID, // 'Application (client) ID' of app registration in Azure portal - this value is a GUID
        authority: new URL(
            process.env.AZ_TENANT_ID,
            process.env.CLOUD_INSTANCE || 'https://login.microsoftonline.com'
        ).href, // Full directory URL, in the form of https://login.microsoftonline.com/<tenant>
        clientSecret: process.env.AZ_CLIENT_SECRET, // Client secret generated from the app registration in Azure portal
    },
    system: {
        loggerOptions: {
            // eslint-disable-next-line no-unused-vars
            loggerCallback(_loglevel, message, _containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: 3,
        },
    },
};

const redirectUri = new URL(`/auth/openid/return`, process.env.REDIRECT_URL)
    .href;
const postLogoutRedirectUri = new URL(process.env.REDIRECT_URL).href;

console.debug(msalConfig.auth.authority);

module.exports = {
    msalConfig,
    redirectUri,
    postLogoutRedirectUri,
};
