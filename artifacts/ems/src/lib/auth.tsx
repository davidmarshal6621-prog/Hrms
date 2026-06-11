import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { UserProfile, setAuthTokenGetter } from "@workspace/api-client-react";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (user: UserProfile, token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("ems_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("ems_token");
  });

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("ems_token"));
  }, []);

  const login = (newUser: UserProfile, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem("ems_user", JSON.stringify(newUser));
    localStorage.setItem("ems_token", newToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
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
