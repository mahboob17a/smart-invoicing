import AsyncStorage from "@react-native-async-storage/async-storage";

// Point this at your backend during development, e.g. your machine's LAN
// IP if testing on a physical device (localhost won't resolve from a
// phone): "http://192.168.1.23:4000".
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000";

const TOKEN_KEY = "smart_invoicing_token";

export async function saveToken(token) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  signup: (payload) => request("/api/auth/signup", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload, auth: false }),

  getOnboardingStatus: () => request("/api/onboarding/status"),
  completeOnboarding: () => request("/api/onboarding/complete", { method: "POST" }),
  getMe: () => request("/api/me"),

  getCompanyProfile: () => request("/api/company-profile"),
  saveCompanyProfile: (payload) => request("/api/company-profile", { method: "POST", body: payload }),

  listIssuingIdentities: () => request("/api/issuing-identities"),
  createIssuingIdentity: (payload) => request("/api/issuing-identities", { method: "POST", body: payload }),

  listRecipients: () => request("/api/recipients"),
  createRecipient: (payload) => request("/api/recipients", { method: "POST", body: payload }),

  listConversionRules: () => request("/api/conversion-rules"),
  createConversionRule: (payload) => request("/api/conversion-rules", { method: "POST", body: payload }),
};
