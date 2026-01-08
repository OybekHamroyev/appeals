import axios from "axios";
const process = import.meta.env;
const api = axios.create({
  baseURL: process.VITE_PYTHON_API_URL,
  headers: { "Content-Type": "application/json" },
});
// request interceptor - attach token if present
api.interceptors.request.use(
  (config) => {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (user && user.token) {
        config.headers.Authorization = `Bearer ${user.token}`;
      }
    } catch (e) {
      // ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// response interceptor - global error handling
api.interceptors.response.use(
  (res) => res,
  (error) => {
    // handle 401 globally: clear local auth and redirect to login
    try {
      const status = error?.response?.status;
      if (status === 401) {
        try {
          localStorage.removeItem("user");
          localStorage.removeItem("check_user");
        } catch (e) {}
        // navigate to login
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
    } catch (e) {}
    return Promise.reject(error);
  }
);

export default api;
