import AsyncStorage from "@react-native-async-storage/async-storage";

// On a physical phone, "localhost" is the phone itself. Set
// EXPO_PUBLIC_API_BASE_URL to your computer's LAN address, e.g.
// http://192.168.1.23:4000 (see README).
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000";

const TOKEN_KEY = "smart_invoicing_token";
export const saveToken = (token) => AsyncStorage.setItem(TOKEN_KEY, token);
export const getToken = () => AsyncStorage.getItem(TOKEN_KEY);
export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = "GET", body, form, auth = true } = {}) {
  const headers = {};
  if (!form) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(`Can't reach the server at ${API_BASE_URL}. Check that the backend is running and the address is right.`, 0);
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details);
  return data;
}

export const assetUrl = (path) => (path && path.startsWith("/") ? `${API_BASE_URL}${path}` : path);

const crud = (base) => ({
  list: () => request(base),
  get: (id) => request(`${base}/${id}`),
  create: (payload) => request(base, { method: "POST", body: payload }),
  update: (id, payload) => request(`${base}/${id}`, { method: "PUT", body: payload }),
  remove: (id) => request(`${base}/${id}`, { method: "DELETE" }),
});

export const api = {
  signup: (payload) => request("/api/auth/signup", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload, auth: false }),
  getMe: () => request("/api/me"),

  getOnboardingStatus: () => request("/api/onboarding/status"),
  completeOnboarding: () => request("/api/onboarding/complete", { method: "POST" }),

  getCompanyProfile: () => request("/api/company-profile"),
  saveCompanyProfile: (payload) => request("/api/company-profile", { method: "POST", body: payload }),

  identities: crud("/api/issuing-identities"),
  recipients: crud("/api/recipients"),
  rules: crud("/api/conversion-rules"),
  reportTemplates: crud("/api/report-templates"),

  numbering: {
    get: () => request("/api/invoice-numbering"),
    setScope: (scope) => request("/api/invoice-numbering/scope", { method: "PUT", body: { scope } }),
    create: (payload) => request("/api/invoice-numbering", { method: "POST", body: payload }),
    update: (id, payload) => request(`/api/invoice-numbering/${id}`, { method: "PUT", body: payload }),
    preview: (payload) => request("/api/invoice-numbering/preview", { method: "POST", body: payload }),
  },

  filename: {
    get: () => request("/api/filename-patterns"),
    save: (pattern) => request("/api/filename-patterns", { method: "PUT", body: { pattern } }),
    preview: (pattern) => request("/api/filename-patterns/preview", { method: "POST", body: { pattern } }),
  },

  uploadLogo: (asset) => {
    const form = new FormData();
    form.append("file", {
      uri: asset.uri,
      name: asset.fileName || "logo.jpg",
      type: asset.mimeType || "image/jpeg",
    });
    return request("/api/uploads/logo", { method: "POST", form });
  },
};
