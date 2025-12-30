import axios from "axios";
const process = import.meta.env;
const api = axios.create({
  baseURL: process.PYTHON_API_URL || "http://172.20.120.103:8000",
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
    // handle 401 globally etc.
    return Promise.reject(error);
  }
);

export default api;
