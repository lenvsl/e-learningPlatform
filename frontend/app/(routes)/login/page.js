"use client"; //="Αυτό το component τρέχει στον browser, όχι στον server"
import { useState } from "react"; //κρατάς δεδομένα (email, password, μηνύματα)
import { useRouter } from "next/navigation"; //κάνεις redirect (/dashboard)

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" }); //form → κρατάει τι πληκτρολόγησε ο χρήστης
  const [message, setMessage] = useState(""); // message → κρατάει τι feedback δείχνω (loading, success, error)
  const router = useRouter();                 // Το UI δεν “θυμάται” μόνο του. Το state είναι η μνήμη του.
  
  const [loading, setLoading] = useState(false);
  
  // handleChange = μία συνάρτηση που δουλεύει για όλα τα inputs
  // name="email" → ενημερώνει form.email 
  // name="password" → ενημερώνει form.password
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); // = να ΜΗ γίνει refresh
    // setMessage("Loading..."); // feedback στον χρήστη
    setMessage("");
    setLoading(true);

    try { //fetch στο backend
      const res = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json(); // Απάντηση από backend... σαν: { "token": "jwt_here" }
      
      
        if (res.ok) {
          localStorage.setItem("token", data.token);
          window.dispatchEvent(new Event('storage'));

          // Redirect ανάλογα με role
          const role = data.user?.role;
          if (role === 'lecturer' || role === 'admin') {
            window.location.href = '/lecturer';
          } else {
            window.location.href = '/dashboard';
          }
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
          Καλώς ήρθατε πίσω
        </h1>
        <p className="text-gray-400">
          Συνδεθείτε στην πλατφόρμα e-learning
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl shadow-xl p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
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
            Σύνδεση
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



// //-----------------------------------------------------------------
// "use client";

// import { useState } from 'react';
// import { useRouter } from 'next/navigation';
// import { useAuth } from '../../context/auth-context';


// import Link from 'next/link';

// const Mail = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
//   </svg>
// );

// const Lock = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
//   </svg>
// );

// const Eye = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
//   </svg>
// );

// const EyeOff = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
//   </svg>
// );

// const AlertCircle = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
//   </svg>
// );

// export default function LoginPage() {
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [showPassword, setShowPassword] = useState(false);
//   const [error, setError] = useState('');
//   const [loading, setLoading] = useState(false);
//   const router = useRouter();
//   const { login } = useAuth();

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError('');
//     setLoading(true);

//     try {
//       await login(email, password);
//       router.push('/dashboard');
//     } catch (err) {
//       setError(err.message || 'Σφάλμα σύνδεσης. Παρακαλώ δοκιμάστε ξανά.');
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center px-4 sm:px-6 lg:px-8">
//       {/* Background decorative elements */}
//       <div className="absolute inset-0 overflow-hidden pointer-events-none">
//         <div className="absolute top-20 right-20 w-96 h-96 bg-purple-600/10 rounded-full filter blur-3xl opacity-30 animate-pulse"></div>
//         <div className="absolute bottom-20 left-20 w-80 h-80 bg-violet-600/10 rounded-full filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
//       </div>

//       <div className="max-w-md w-full space-y-8 relative z-10">
//         {/* Logo and Header */}
//         <div className="text-center">
//           <div className="flex justify-center mb-6">
//             <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/50">
//               <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
//               </svg>
//             </div>
//           </div>
//           <h2 className="text-3xl font-bold text-white mb-2">
//             Καλώς ήρθατε πίσω
//           </h2>
//           <p className="text-gray-400">
//             Συνδεθείτε στην πλατφόρμα e-learning
//           </p>
//         </div>

//         {/* Login Form */}
//         <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl shadow-xl p-8">
//           {/* Error Message */}
//           {error && (
//             <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
//               <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
//               <p className="text-red-400 text-sm">{error}</p>
//             </div>
//           )}

//           <form onSubmit={handleSubmit} className="space-y-6">
//             {/* Email Input */}
//             <div>
//               <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
//                 Email
//               </label>
//               <div className="relative">
//                 <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
//                 <input
//                   id="email"
//                   type="email"
//                   required
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   className="w-full pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
//                   placeholder="your.email@example.com"
//                 />
//               </div>
//             </div>

//             {/* Password Input */}
//             <div>
//               <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
//                 Κωδικός Πρόσβασης
//               </label>
//               <div className="relative">
//                 <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
//                 <input
//                   id="password"
//                   type={showPassword ? "text" : "password"}
//                   required
//                   value={password}
//                   onChange={(e) => setPassword(e.target.value)}
//                   className="w-full pl-10 pr-12 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
//                   placeholder="••••••••"
//                 />
//                 <button
//                   type="button"
//                   onClick={() => setShowPassword(!showPassword)}
//                   className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
//                 >
//                   {showPassword ? (
//                     <EyeOff className="w-5 h-5" />
//                   ) : (
//                     <Eye className="w-5 h-5" />
//                   )}
//                 </button>
//               </div>
//             </div>

//             {/* Remember Me & Forgot Password */}
//             <div className="flex items-center justify-between">
//               <div className="flex items-center">
//                 <input
//                   id="remember-me"
//                   type="checkbox"
//                   className="h-4 w-4 rounded border-gray-600 bg-gray-700/50 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-800"
//                 />
//                 <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-300">
//                   Να με θυμάσαι
//                 </label>
//               </div>

//               <Link
//                 href="/reset-password"
//                 className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
//               >
//                 Ξεχάσατε τον κωδικό;
//               </Link>
//             </div>

//             {/* Submit Button */}
//             <button
//               type="submit"
//               disabled={loading}
//               className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white font-semibold py-3 rounded-lg transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg shadow-purple-500/30"
//             >
//               {loading ? (
//                 <span className="flex items-center justify-center gap-2">
//                   <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
//                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
//                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
//                   </svg>
//                   Σύνδεση...
//                 </span>
//               ) : (
//                 'Σύνδεση'
//               )}
//             </button>
//           </form>

//           {/* Divider */}
//           <div className="mt-6">
//             <div className="relative">
//               <div className="absolute inset-0 flex items-center">
//                 <div className="w-full border-t border-gray-700"></div>
//               </div>
//               <div className="relative flex justify-center text-sm">
//                 <span className="px-2 bg-gray-800/60 text-gray-400">ή</span>
//               </div>
//             </div>
//           </div>

//           {/* Register Link */}
//           <div className="mt-6 text-center">
//             <p className="text-gray-400">
//               Δεν έχετε λογαριασμό;{' '}
//               <Link
//                 href="/register"
//                 className="text-purple-400 hover:text-purple-300 font-semibold transition-colors"
//               >
//                 Εγγραφείτε τώρα
//               </Link>
//             </p>
//           </div>
//         </div>

//         {/* Footer */}
//         <p className="text-center text-gray-500 text-sm">
//           © 2024 Πανεπιστήμιο Πατρών. Όλα τα δικαιώματα διατηρούνται.
//         </p>
//       </div>
//     </div>
//   );
// }