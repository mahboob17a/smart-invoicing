import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveToken, getToken, clearToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [user, setUser] = useState(null);
  const [onboardingSteps, setOnboardingSteps] = useState(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await api.getMe();
        let steps = null;
        if (!me.organization.onboardingComplete) {
          const status = await api.getOnboardingStatus();
          steps = status.steps;
        }
        setOrganization(me.organization);
        setUser(me.user);
        setOnboardingSteps(steps);
        setIsSignedIn(true);
      } catch (e) {
        // Token is invalid/expired, or the account no longer exists —
        // either way, fall back to the sign-in screen rather than get
        // stuck on a loading spinner.
        await clearToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signup = useCallback(async (payload) => {
    const result = await api.signup(payload);
    await saveToken(result.token);
    setOrganization(result.organization);
    setUser(result.user);
    setOnboardingSteps({
      companyProfile: false,
      issuingIdentity: false,
      recipient: false,
      conversionRule: false,
    });
    setIsSignedIn(true);
    return result;
  }, []);

  const login = useCallback(async (payload) => {
    const result = await api.login(payload);
    await saveToken(result.token);
    // Fetch onboarding progress before flipping isSignedIn, so
    // OnboardingStack mounts with the correct resume screen on its very
    // first render — React Navigation ignores initialRouteName changes
    // after a stack has already mounted.
    let steps = null;
    if (!result.organization.onboardingComplete) {
      const status = await api.getOnboardingStatus();
      steps = status.steps;
    }
    setOrganization(result.organization);
    setUser(result.user);
    setOnboardingSteps(steps);
    setIsSignedIn(true);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setOrganization(null);
    setUser(null);
    setOnboardingSteps(null);
    setIsSignedIn(false);
  }, []);

  // Called by OnboardingCompleteScreen once the user taps through, so the
  // stack swap from Onboarding to the main App happens on purpose — not
  // the instant the last form saves, which would yank the "you're all
  // set" screen out from under the user before they see it.
  const markOnboardingComplete = useCallback(() => {
    setOrganization((prev) => (prev ? { ...prev, onboardingComplete: true } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isSignedIn,
        organization,
        user,
        onboardingSteps,
        signup,
        login,
        signOut,
        markOnboardingComplete,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
