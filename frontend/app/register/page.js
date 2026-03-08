"use client";
import { useState } from "react";

export default function RegisterPage() {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("Loading...");

    try {
      const res = await fetch("http://localhost:5000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage("✅ Registration successful!");
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (err) {
      setMessage("❌ Network error");
    }
  };


  return (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center px-4 sm:px-6 lg:px-8">
    {/* Background decorative elements */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-20 right-20 w-96 h-96 bg-purple-600/10 rounded-full filter blur-3xl opacity-30 animate-pulse"></div>
      <div
        className="absolute bottom-20 left-20 w-80 h-80 bg-violet-600/10 rounded-full filter blur-3xl opacity-20 animate-pulse"
        style={{ animationDelay: "2s" }}
      ></div>
    </div>

    <div className="max-w-md w-full space-y-8 relative z-10">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">
          Δημιουργία Λογαριασμού
        </h1>
        <p className="text-gray-400">
          Εγγραφείτε στην πλατφόρμα e-learning
        </p>
      </div>

      {/* Register Card */}
      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl shadow-xl p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Όνομα
            </label>
            <input
              type="text"
              name="first_name"
              value={form.first_name}
              onChange={handleChange}
              required
              placeholder="Όνομα"
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Επώνυμο
            </label>
            <input
              type="text"
              name="last_name"
              value={form.last_name}
              onChange={handleChange}
              required
              placeholder="Επώνυμο"
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              placeholder="your.email@example.com"
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Κωδικός Πρόσβασης
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white font-semibold py-3 rounded-lg transition-all duration-300 transform hover:scale-[1.02] shadow-lg shadow-purple-500/30"
          >
            Εγγραφή
          </button>

          {/* Message */}
          {message && (
            <p className="text-center text-sm text-gray-300">
              {message}
            </p>
          )}
        </form>
      </div>

      {/* Footer */}
      <p className="text-center text-gray-500 text-sm">
        © 2026 Πανεπιστήμιο Πατρών. Όλα τα δικαιώματα διατηρούνται.
      </p>
    </div>
  </div>
);
}



//   return (
//     <main className="flex min-h-screen items-center justify-center p-6">
//       <form
//         onSubmit={handleSubmit}
//         className="bg-white shadow-md rounded p-6 w-full max-w-md space-y-4 text-black"
//       >
//         <h1 className="text-2xl font-bold">Register</h1>

//         <input
//           type="text"
//           name="first_name"
//           placeholder="First Name"
//           value={form.first_name}
//           onChange={handleChange}
//           className="w-full border p-2 rounded"
//           required
//         />
//         <input
//           type="text"
//           name="last_name"
//           placeholder="Last Name"
//           value={form.last_name}
//           onChange={handleChange}
//           className="w-full border p-2 rounded"
//           required
//         />
//         <input
//           type="email"
//           name="email"
//           placeholder="Email"
//           value={form.email}
//           onChange={handleChange}
//           className="w-full border p-2 rounded"
//           required
//         />
//         <input
//           type="password"
//           name="password"
//           placeholder="Password"
//           value={form.password}
//           onChange={handleChange}
//           className="w-full border p-2 rounded"
//           required
//         />

//         <button
//           type="submit"
//           className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
//         >
//           Register
//         </button>

//         {message && <p className="text-center mt-2">{message}</p>}
//       </form>
//     </main>
//   );
// }
