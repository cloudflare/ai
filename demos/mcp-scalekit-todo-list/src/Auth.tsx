import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";

// Scalekit configuration
const SCALEKIT_CLIENT_ID = import.meta.env.VITE_SCALEKIT_CLIENT_ID;
const SCALEKIT_ENV_URL = import.meta.env.VITE_SCALEKIT_ENVIRONMENT_URL;

/**
 * A higher-order component that enforces a login requirement for the wrapped component.
 * If the user is not logged in, the user is redirected to the login page and the
 * current URL is stored in localStorage to enable return after authentication.
 */
export const withLoginRequired = (Component: React.FC) => () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check if user has valid session
        const checkAuth = async () => {
            try {
                // Check for session cookie (set by backend)
                const response = await fetch('/api/auth/validate', {
                    credentials: 'include', // Include cookies
                });
                
                if (response.ok) {
                    setIsAuthenticated(true);
                } else {
                    localStorage.setItem('returnTo', window.location.href);
                    window.location.href = '/login';
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                localStorage.setItem('returnTo', window.location.href);
                window.location.href = '/login';
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, []);

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (!isAuthenticated) {
        return null;
    }

    return <Component/>;
};

/**
 * Redirects the user to a specified URL stored in local storage or a default location.
 */
const onLoginComplete = () => {
    const returnTo = localStorage.getItem('returnTo');
    if (returnTo) {
        localStorage.removeItem('returnTo');
        window.location.href = returnTo;
    } else {
        window.location.href = '/todoapp';
    }
};

/**
 * Login page - redirects to Scalekit authorization
 */
export function Login() {
    useEffect(() => {
        const redirectToScalekit = () => {
            if (!SCALEKIT_CLIENT_ID || !SCALEKIT_ENV_URL) {
                console.error('Scalekit not configured');
                return;
            }

            const redirectUri = `${window.location.origin}/authenticate`;
            const authUrl = new URL(`${SCALEKIT_ENV_URL}/oauth/authorize`);
            authUrl.searchParams.set('client_id', SCALEKIT_CLIENT_ID);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', 'openid email profile');
            authUrl.searchParams.set('state', Math.random().toString(36).substring(7));
            
            window.location.href = authUrl.toString();
        };

        redirectToScalekit();
    }, []);

    return <div>Redirecting to login...</div>;
}

/**
 * OAuth authorization page - handles OAuth consent flow
 */
export const Authorize = withLoginRequired(function () {
    const navigate = useNavigate();

    useEffect(() => {
        // For OAuth authorization, redirect to Scalekit
        const redirectToScalekit = () => {
            if (!SCALEKIT_CLIENT_ID || !SCALEKIT_ENV_URL) {
                console.error('Scalekit not configured');
                return;
            }

            const redirectUri = `${window.location.origin}/authenticate`;
            const authUrl = new URL(`${SCALEKIT_ENV_URL}/oauth/authorize`);
            authUrl.searchParams.set('client_id', SCALEKIT_CLIENT_ID);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', 'openid email profile mcp:tools:* mcp:resources:*');
            authUrl.searchParams.set('state', Math.random().toString(36).substring(7));
            
            window.location.href = authUrl.toString();
        };

        redirectToScalekit();
    }, [navigate]);

    return <div>Redirecting to authorization...</div>;
});

/**
 * Authentication callback handler - exchanges authorization code for tokens
 */
export function Authenticate() {
    const navigate = useNavigate();
    const [isProcessing, setIsProcessing] = useState(false);
    const [hasProcessed, setHasProcessed] = useState(false);
    const processedOnceRef = useRef(false); // guard against StrictMode double effects

    useEffect(() => {
        // Prevent multiple executions - check StrictMode guard and local markers
        if (processedOnceRef.current || isProcessing || hasProcessed) return;
        processedOnceRef.current = true;
        
        // Check if we've already processed this code
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const processedKey = `auth_processed_${code}`;
        
        if (code && localStorage.getItem(processedKey)) {
            console.log('Code already processed, redirecting...');
            window.location.href = '/todoapp';
            return;
        }

        const handleCallback = async () => {
            setIsProcessing(true);
            setHasProcessed(true);
            
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const error = params.get('error');

            if (error) {
                console.error('Auth error:', error);
                window.location.href = '/login';
                return;
            }

            if (!code) {
                window.location.href = '/login';
                return;
            }

            // Mark this code as being processed
            localStorage.setItem(processedKey, 'true');
            
            // Clear the code from URL immediately to prevent reuse
            window.history.replaceState({}, document.title, window.location.pathname);

            try {
                // Exchange authorization code for tokens
                const response = await fetch('/api/auth/callback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include', // Include cookies
                    body: JSON.stringify({ code }),
                });

                if (response.ok) {
                    // Remove the processed marker on success
                    localStorage.removeItem(processedKey);
                    onLoginComplete();
                } else {
                    const errorData = await response.json() as { error?: string };
                    // Remove the processed marker on error so user can retry
                    localStorage.removeItem(processedKey);
                    throw new Error(errorData.error || 'Token exchange failed');
                }
            } catch (error) {
                console.error('Authentication failed:', error);
                // Remove the processed marker on error
                localStorage.removeItem(processedKey);
                window.location.href = '/login';
            } finally {
                setIsProcessing(false);
            }
        };

        handleCallback();
    }, [navigate, isProcessing, hasProcessed]);

    return <div>Completing authentication...</div>;
}

/**
 * Logout component
 */
export const Logout = function () {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // Check if user is authenticated
        fetch('/api/auth/validate', {
            credentials: 'include',
        })
            .then(res => {
                if (res.ok) {
                    setIsAuthenticated(true);
                }
            })
            .catch(() => setIsAuthenticated(false));
    }, []);

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { 
                method: 'POST',
                credentials: 'include',
            });
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
            window.location.href = '/login';
        }
    };

    if (!isAuthenticated) return null;

    return (
        <button className="primary" onClick={handleLogout}>
            Log Out
        </button>
    );
};
