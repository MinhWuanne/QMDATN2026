import AdminApp from "./admin/AdminApp.jsx";
import CustomerApp from "./customer/CustomerApp.jsx";

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/admin" || path.startsWith("/admin/")) {
    return <AdminApp />;
  }

  return <CustomerApp />;
}

export default App;
