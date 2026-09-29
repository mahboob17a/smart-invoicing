import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// On a physical phone, "localhost" is the phone itself. Set
// EXPO_PUBLIC_API_BASE_URL to your computer's LAN address, e.g.
// http://192.168.1.23:4000 (see README).
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000";

const TOKEN_KEY = "smart_invoicing_token";
let cachedToken = null;
export const saveToken = (token) => { cachedToken = token; return AsyncStorage.setItem(TOKEN_KEY, token); };
export const getToken = async () => (cachedToken ??= await AsyncStorage.getItem(TOKEN_KEY));
export const clearToken = () => { cachedToken = null; return AsyncStorage.removeItem(TOKEN_KEY); };

/** Image source for files that need the session (bill photos). */
export const authedSource = (path) =>
  path ? { uri: `${API_BASE_URL}${path}`, headers: cachedToken ? { Authorization: `Bearer ${cachedToken}` } : undefined } : null;

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

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PDF_TYPE = "application/pdf";

// React Native's FormData takes { uri, name, type }; browsers need a Blob.
async function appendFile(form, field, { uri, name, type }) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append(field, new Blob([blob], { type }), name);
  } else {
    form.append(field, { uri, name, type });
  }
}

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

  bills: {
    list: (params = {}) => {
      const q = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
      return request(`/api/bills${q ? `?${q}` : ""}`);
    },
    summary: () => request("/api/bills/summary"),
    get: (id) => request(`/api/bills/${id}`),
    save: (id, payload) => request(`/api/bills/${id}`, { method: "PUT", body: payload }),
    reread: (id) => request(`/api/bills/${id}/extract`, { method: "POST" }),
    /** choices: { recipientId, conversionRuleId, templateId, issuingIdentityId } — any may be left out */
    convertPreview: (id, choices = {}) => request(`/api/bills/${id}/convert/preview`, { method: "POST", body: choices }),
    convert: (id, choices = {}) => request(`/api/bills/${id}/convert`, { method: "POST", body: choices }),
    remove: (id) => request(`/api/bills/${id}`, { method: "DELETE" }),
    /** pages: [{ uri, mimeType, name }] — up to 5 photos, or one PDF */
    upload: async (pages) => {
      const form = new FormData();
      for (const [i, p] of pages.entries()) {
        await appendFile(form, "files", { uri: p.uri, name: p.name || `page-${i + 1}.jpg`, type: p.mimeType || "image/jpeg" });
      }
      return request("/api/bills", { method: "POST", form });
    },
  },

  invoices: {
    list: (q) => request(`/api/invoices${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    get: (id) => request(`/api/invoices/${id}`),
    regenerate: (id, choices = {}) => request(`/api/invoices/${id}/regenerate`, { method: "POST", body: choices }),
    filePath: (id, format) => `/api/invoices/${id}/file?format=${format}`,
  },

  templates: {
    list: () => request("/api/templates"),
    get: (id) => request(`/api/templates/${id}`),
    fields: () => request("/api/templates/fields"),
    sampleValues: () => request("/api/templates/sample-values"),
    create: (payload) => request("/api/templates", { method: "POST", body: payload }),
    update: (id, payload) => request(`/api/templates/${id}`, { method: "PUT", body: payload }),
    saveMapping: (id, mappings) => request(`/api/templates/${id}/mapping`, { method: "PUT", body: { mappings } }),
    makeDefault: (id) => request(`/api/templates/${id}/default`, { method: "POST" }),
    remove: (id) => request(`/api/templates/${id}`, { method: "DELETE" }),
    /** file: { uri, name, mimeType } from the document picker. id = upload a new version of that template. */
    upload: async (file, id) => {
      const form = new FormData();
      await appendFile(form, "file", { uri: file.uri, name: file.name || "template.docx", type: DOCX_TYPE });
      return request(id ? `/api/templates/${id}/upload` : "/api/templates/upload", { method: "POST", form });
    },
  },

  uploadLogo: async (asset) => {
    const form = new FormData();
    await appendFile(form, "file", { uri: asset.uri, name: asset.fileName || "logo.jpg", type: asset.mimeType || "image/jpeg" });
    return request("/api/uploads/logo", { method: "POST", form });
  },
};
