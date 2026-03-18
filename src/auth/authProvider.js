/*
 * Copyright (c) SPIE ICS AG. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const msal = require('@azure/msal-node');
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

    isMerakiGrantUrl(urlString) {
        try {
            const parsedUrl = new URL(urlString);
            const hostname = parsedUrl.hostname;
            return (
                hostname === 'network-auth.com' ||
                hostname.endsWith('.network-auth.com')
            );
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

            // base_grant_url must be network-auth.com (Meraki's domain)
            if (!this.isMerakiGrantUrl(query.base_grant_url)) {
                return next(new Error('Invalid base_grant_url domain'));
            }

            // user_continue_url just needs to be valid HTTPS
            try {
                const continueUrl = new URL(query.user_continue_url);
                if (continueUrl.protocol !== 'https:') {
                    return next(new Error('user_continue_url must use HTTPS'));
                }
            } catch {
                return next(new Error('Invalid user_continue_url'));
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
                return next(
                    new Error('State mismatch - potential CSRF attack')
                );
            }

            // Validate PKCE codes and auth code request exist in session
            if (
                !req.session.pkceCodes?.verifier ||
                !req.session.authCodeRequest
            ) {
                return next(new Error('Session expired. Please login again.'));
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

                // Clear PKCE codes and auth code request - single use only
                delete req.session.pkceCodes;
                delete req.session.authCodeRequest;
                delete req.session.authCodeUrlRequest;

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

                // Decode URL
                const decodedUrl = decodeURIComponent(state.successRedirect);

                // validates the final redirect (built from base_grant_url) is a valid URL and belongs to Meraki domain to prevent open redirect vulnerabilities
                const schema = Joi.string()
                    .uri({
                        scheme: [/https?/],
                    })
                    .custom((value, helpers) => {
                        if (!this.isMerakiGrantUrl(value)) {
                            return helpers.error('any.invalid');
                        }
                        return value;
                    }, 'Domain validation');

                const validatedRedirectUrl =
                    await schema.validateAsync(decodedUrl);
                // Save session only after full validation
                await new Promise((resolve, reject) =>
                    req.session.save((err) => (err ? reject(err) : resolve()))
                );
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

            req.session.destroy((err) => {
                if (err) console.error('Session destroy error:', err);
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
                responseMode: 'form_post', // recommended for confidential clients
                codeChallenge: req.session.pkceCodes.challenge,
                codeChallengeMethod: req.session.pkceCodes.challengeMethod,
            };

            req.session.authCodeRequest = {
                ...authCodeRequestParams,
                code: '',
            };

            try {
                // Ensure session is saved before redirecting to auth code url to prevent race conditions
                await new Promise((resolve, reject) =>
                    req.session.save((err) => (err ? reject(err) : resolve()))
                );

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
        const endpoint = new URL(
            'https://login.microsoftonline.com/common/discovery/instance'
        );
        endpoint.searchParams.set('api-version', '1.1');
        endpoint.searchParams.set(
            'authorization_endpoint',
            `${authority}/oauth2/v2.0/authorize`
        );
        const res = await fetch(endpoint.toString(), {
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok)
            throw new Error(`Discovery metadata fetch failed: ${res.status}`);
        return res.json();
    }

    /**
     * Retrieves oidc metadata from the openid endpoint
     * @returns
     */
    async getAuthorityMetadata(authority) {
        const res = await fetch(
            `${authority}/v2.0/.well-known/openid-configuration`,
            { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok)
            throw new Error(`Authority metadata fetch failed: ${res.status}`);
        return res.json();
    }
}

const authProvider = new AuthProvider(msalConfig);

module.exports = authProvider;
