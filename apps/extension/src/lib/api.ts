import { API_BASE_URL } from "../common";

export const invokeAPI = async (payload: any) => {
  const res = await fetch(`${API_BASE_URL}/api/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json();
};
