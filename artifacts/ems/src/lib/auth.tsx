import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserProfile, setAuthTokenGetter } from "@workspace/api-client-react";
import { apiUrl } from "@/lib/api-path";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (user: UserProfile, token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isSessionLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("ems_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("ems_token");
  });
  const [isSessionLoading, setIsSessionLoading] = useState(() => {
    return Boolean(localStorage.getItem("ems_token"));
  });

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("ems_token"));
  }, []);

  useEffect(() => {
    if (!token) {
      setIsSessionLoading(false);
      return;
    }

    let current = true;
    setIsSessionLoading(true);
    fetch(apiUrl("/auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        if (!current) return;
        if (response.status === 401) {
          queryClient.removeQueries();
          setUser(null);
          setToken(null);
          localStorage.removeItem("ems_user");
          localStorage.removeItem("ems_token");
          return;
        }
        if (!response.ok) return;

        const freshUser = await response.json() as UserProfile;
        if (!current) return;
        setUser(freshUser);
        localStorage.setItem("ems_user", JSON.stringify(freshUser));
      })
      .catch(() => {
        // Keep the saved session if the API is temporarily unreachable.
      })
      .finally(() => {
        if (current) setIsSessionLoading(false);
      });

    return () => {
      current = false;
    };
  }, [token, queryClient]);

  const login = (newUser: UserProfile, newToken: string) => {
    queryClient.removeQueries();
    setUser(newUser);
    setToken(newToken);
    setIsSessionLoading(true);
    localStorage.setItem("ems_user", JSON.stringify(newUser));
    localStorage.setItem("ems_token", newToken);
  };

  const logout = () => {
    queryClient.removeQueries();
    setUser(null);
    setToken(null);
    setIsSessionLoading(false);
    localStorage.removeItem("ems_user");
    localStorage.removeItem("ems_token");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!token,
        isSessionLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
