import AsyncStorage from "@react-native-async-storage/async-storage";

// Point this at your backend during development, e.g. your machine's LAN
// IP if testing on a physical device (localhost won't resolve from a
// phone): "http://192.168.1.23:4000".
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000";

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

// `form` sends multipart/form-data (file uploads); fetch sets that
// Content-Type itself, including the boundary, so it must not be set here.
async function request(path, { method = "GET", body, form, auth = true } = {}) {
  const headers = form ? {} : { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
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

  getFilenamePlaceholders: () => request("/api/filename-patterns/placeholders"),
  getFilenamePattern: () => request("/api/filename-patterns"),
  saveFilenamePattern: (payload) => request("/api/filename-patterns", { method: "POST", body: payload }),

  getReportTemplateOptions: () => request("/api/report-templates/options"),
  listReportTemplates: () => request("/api/report-templates"),
  createReportTemplate: (payload) => request("/api/report-templates", { method: "POST", body: payload }),

  // `file` comes from src/bills/capture.js ({ uri, name, mimeType }).
  uploadBill: (file) => {
    const form = new FormData();
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType });
    return request("/api/bills", { method: "POST", form });
  },
  listBills: () => request("/api/bills"),
  getBill: (id) => request(`/api/bills/${id}`),
  updateBill: (id, payload) => request(`/api/bills/${id}`, { method: "PUT", body: payload }),
  retryExtraction: (id) => request(`/api/bills/${id}/extract`, { method: "POST" }),
  deleteBill: (id) => request(`/api/bills/${id}`, { method: "DELETE" }),

  // `image` is an expo-image-picker asset ({ uri, mimeType, fileName }).
  uploadLogo: (image) => {
    const form = new FormData();
    form.append("file", {
      uri: image.uri,
      name: image.fileName || "logo.jpg",
      type: image.mimeType || "image/jpeg",
    });
    return request("/api/assets/logo", { method: "POST", form });
  },
};
