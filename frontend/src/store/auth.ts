import { create } from "zustand";

export interface User { id: number; nom: string; role: string; identifiant: string; }
interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem("shopdesk_user") || "null"),
  token: localStorage.getItem("shopdesk_token"),
  setAuth: (user, token) => {
    localStorage.setItem("shopdesk_token", token);
    localStorage.setItem("shopdesk_user", JSON.stringify(user));
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem("shopdesk_token");
    localStorage.removeItem("shopdesk_user");
    set({ user: null, token: null });
  },
}));
