/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const msal = require('@azure/msal-node');
const axios = require('axios');
const crypto = require('crypto');
const { msalConfig } = require('../authConfig');
const Joi = require('joi');

class AuthProvider {
    constructor(msalConfig) {
        this.msalConfig = msalConfig;
    }

    // Helper methods to replace CryptoProvider functionality
    base64Encode(input) {
        return Buffer.from(input).toString('base64');
    }

    base64Decode(input) {
        return Buffer.from(input, 'base64').toString('utf8');
    }

    async generatePkceCodes() {
        // Generate a random verifier (43-128 characters)
        const verifier = crypto.randomBytes(32).toString('base64url');
        
        // Generate challenge from verifier using SHA256
        const challenge = crypto
            .createHash('sha256')
            .update(verifier)
            .digest('base64url');

        return { verifier, challenge };
    }

    isValidRedirectDomain(urlString) {
        try {
            const parsedUrl = new URL(urlString);
            const hostname = parsedUrl.hostname;
            return hostname === 'network-auth.com' || 
                hostname.endsWith('.network-auth.com');
        } catch {
            return false;
        }
    }

    login(options = {}) {
        return async (req, res, next) => {
            /**
             * MSAL Node library allows you to pass your custom state as state parameter in the Request object.
             * The state parameter can also be used to encode information of the app's state before redirect.
             * You can pass the user's state in the app, such as the page or view they were on, as input to this parameter.
             */

            const query = req.query; 
            
            // Validate required parameters exist
            if (!query.base_grant_url || !query.user_continue_url) {
                return next(new Error('Missing required query parameters'));
            }

            // Validate base_grant_url domain early
            if (!this.isValidRedirectDomain(query.base_grant_url)) {
                return next(new Error('Invalid base_grant_url domain'));
            }

            const state = this.base64Encode(
                JSON.stringify({
                    successRedirect: `${query.base_grant_url}?continue_url=${query.user_continue_url}`,
                })
            );

            const authCodeUrlRequestParams = {
                state: state,

                 /**
                 * By default, MSAL Node will add OIDC scopes to the auth code url request. For more information, visit:
                 * https://docs.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
                 */
                scopes: options.scopes || [],
                redirectUri: options.redirectUri,
            };

            const authCodeRequestParams = {
                state: state,

                /**
                 * By default, MSAL Node will add OIDC scopes to the auth code request. For more information, visit:
                 * https://docs.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
                 */
                scopes: options.scopes || [],
                redirectUri: options.redirectUri,
            };

            /**
             * If the current msal configuration does not have cloudDiscoveryMetadata or authorityMetadata, we will
             * make a request to the relevant endpoints to retrieve the metadata. This allows MSAL to avoid making
             * metadata discovery calls, thereby improving performance of token acquisition process. For more, see:
             * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/performance.md
             */
            if (
                !this.msalConfig.auth.cloudDiscoveryMetadata ||
                !this.msalConfig.auth.authorityMetadata
            ) {
                const [cloudDiscoveryMetadata, authorityMetadata] =
                    await Promise.all([
                        this.getCloudDiscoveryMetadata(
                            this.msalConfig.auth.authority
                        ),
                        this.getAuthorityMetadata(
                            this.msalConfig.auth.authority
                        ),
                    ]);

                this.msalConfig.auth.cloudDiscoveryMetadata = JSON.stringify(
                    cloudDiscoveryMetadata
                );
                this.msalConfig.auth.authorityMetadata =
                    JSON.stringify(authorityMetadata);
            }

            const msalInstance = this.getMsalInstance(this.msalConfig);

            // trigger the first leg of auth code flow
            return this.redirectToAuthCodeUrl(
                authCodeUrlRequestParams,
                authCodeRequestParams,
                msalInstance
            )(req, res, next);
        };
    }

    // eslint-disable-next-line no-unused-vars
    handleRedirect(_options = {}) {
        return async (req, res, next) => {
            if (!req.body || !req.body.state) {
                return next(new Error('Error: response not found'));
            }

            // CSRF protection - validate state matches what we sent
            if (req.body.state !== req.session.authCodeUrlRequest?.state) {
                return next(new Error('State mismatch - potential CSRF attack'));
            }

            const authCodeRequest = {
                ...req.session.authCodeRequest,
                code: req.body.code,
                codeVerifier: req.session.pkceCodes.verifier,
            };

            try {
                const msalInstance = this.getMsalInstance(this.msalConfig);

                if (req.session.tokenCache) {
                    msalInstance
                        .getTokenCache()
                        .deserialize(req.session.tokenCache);
                }

                const tokenResponse = await msalInstance.acquireTokenByCode(
                    authCodeRequest,
                    req.body
                );

                req.session.tokenCache = msalInstance
                    .getTokenCache()
                    .serialize();
                req.session.idToken = tokenResponse.idToken;
                req.session.account = tokenResponse.account;
                req.session.isAuthenticated = true;

                // Parse state with error handling
                let state;
                try {
                    state = JSON.parse(this.base64Decode(req.body.state));
                } catch {
                    return next(new Error('Invalid state parameter'));
                }

                if (!state.successRedirect) {
                    return next(new Error('Missing redirect URL in state'));
                }
                // Accept https and validate domain
                const schema = Joi.string().uri({
                    scheme: [/https?/]
                }).custom((value, helpers) => {
                    if (!this.isValidRedirectDomain(value)) {
                        return helpers.error('any.invalid');
                    }
                    return value;
                }, 'Domain validation');
                // Decode Base64 URL
                const decodedUrl = decodeURIComponent(state.successRedirect);
                //do the validation against the decoded URL
                const validatedRedirectUrl  = await schema.validateAsync(decodedUrl);
                //it's safe to redirect to the provided URL
                res.redirect(validatedRedirectUrl);
            } catch (error) {
                next(error);
            }
        };
    }

    logout(options = {}) {
        // eslint-disable-next-line no-unused-vars
        return (req, res, _next) => {
            /**
             * Construct a logout URI and redirect the user to end the
             * session with Azure AD. For more information, visit:
             * https://docs.microsoft.com/azure/active-directory/develop/v2-protocols-oidc#send-a-sign-out-request
             */
            let logoutUri = `${this.msalConfig.auth.authority}/oauth2/v2.0/`;

            if (options.postLogoutRedirectUri) {
                logoutUri += `logout?post_logout_redirect_uri=${options.postLogoutRedirectUri}`;
            }

            req.session.destroy(() => {
                res.redirect(logoutUri);
            });
        };
    }

    /**
     * Instantiates a new MSAL ConfidentialClientApplication object
     * @param msalConfig: MSAL Node Configuration object
     * @returns
     */
    getMsalInstance(msalConfig) {
        return new msal.ConfidentialClientApplication(msalConfig);
    }

    /**
     * Prepares the auth code request parameters and initiates the first leg of auth code flow
     * @param req: Express request object
     * @param res: Express response object
     * @param next: Express next function
     * @param authCodeUrlRequestParams: parameters for requesting an auth code url
     * @param authCodeRequestParams: parameters for requesting tokens using auth code
     */
    redirectToAuthCodeUrl(
        authCodeUrlRequestParams,
        authCodeRequestParams,
        msalInstance
    ) {
        return async (req, res, next) => {
            // Generate PKCE Codes before starting the authorization flow
            const { verifier, challenge } = await this.generatePkceCodes();

            // Set generated PKCE codes and method as session vars
            req.session.pkceCodes = {
                challengeMethod: 'S256',
                verifier: verifier,
                challenge: challenge,
            };

            /**
             * By manipulating the request objects below before each request, we can obtain
             * auth artifacts with desired claims. For more information, visit:
             * https://azuread.github.io/microsoft-authentication-library-for-js/ref/modules/_azure_msal_node.html#authorizationurlrequest
             * https://azuread.github.io/microsoft-authentication-library-for-js/ref/modules/_azure_msal_node.html#authorizationcoderequest
             **/
            req.session.authCodeUrlRequest = {
                ...authCodeUrlRequestParams,
                responseMode: msal.ResponseMode.FORM_POST, // recommended for confidential clients
                codeChallenge: req.session.pkceCodes.challenge,
                codeChallengeMethod: req.session.pkceCodes.challengeMethod,
            };

            req.session.authCodeRequest = {
                ...authCodeRequestParams,
                code: '',
            };

            try {
                const authCodeUrlResponse = await msalInstance.getAuthCodeUrl(
                    req.session.authCodeUrlRequest
                );
                res.redirect(authCodeUrlResponse);
            } catch (error) {
                next(error);
            }
        };
    }

    /**
     * Retrieves cloud discovery metadata from the /discovery/instance endpoint
     * @returns
     */
    async getCloudDiscoveryMetadata(authority) {
        const endpoint =
            'https://login.microsoftonline.com/common/discovery/instance';
        const response = await axios.get(endpoint, {
            params: {
                'api-version': '1.1',
                authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
            },
        });
        return await response.data;
    }

    /**
     * Retrieves oidc metadata from the openid endpoint
     * @returns
     */
    async getAuthorityMetadata(authority) {
        const endpoint = `${authority}/v2.0/.well-known/openid-configuration`;

        try {
            const response = await axios.get(endpoint);
            return await response.data;
        } catch (error) {
            console.error(`error on getAuthorityMetadata ${error}`);
        }
    }
}

const authProvider = new AuthProvider(msalConfig);

module.exports = authProvider;
