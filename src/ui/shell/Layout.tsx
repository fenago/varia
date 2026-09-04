import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Rail } from "./Rail";
import { Header } from "./Header";

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="va-app">
      <Rail />
      <main className="va-main">
        <Header />
        <div className="va-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
