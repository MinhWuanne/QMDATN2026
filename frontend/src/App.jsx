
import { useEffect, useState } from "react";

function App() {
  const [status, setStatus] = useState("Đang kết nối...");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://localhost:3000/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("API trả về lỗi");
        }
        return response.json();
      })
      .then((data) => {
        setStatus(data.message);
        setError("");
      })
      .catch(() => {
        setError("Không thể kết nối backend.");
        setStatus("");
      });
  }, []);

  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>Website của tôi</h1>
      <p>Frontend: React + Vite</p>
      <p>Backend: Express</p>

      <h2>Trạng thái kết nối</h2>

      {error ? (
        <p style={{ color: "red" }}>{error}</p>
      ) : (
        <p>{status}</p>
      )}
    </main>
  );
}

export default App;
