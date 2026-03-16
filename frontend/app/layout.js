'use client';

import "./globals.css";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function RootLayout({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkAuth();
    window.addEventListener('storage', checkAuth);
    return () => window.removeEventListener('storage', checkAuth);
  }, []);

  const checkAuth = () => {
    const token = sessionStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload);
        setIsLoggedIn(true);
      } catch {
        sessionStorage.removeItem('token');
        setIsLoggedIn(false);
      }
    } else {
      setIsLoggedIn(false);
      setUser(null);
    }
  };

  const dashboardHref = user?.role === 'lecturer' ? '/lecturer' : user?.role === 'admin' ? '/admin' : '/dashboard';

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    setIsLoggedIn(false);
    setUser(null);
    window.location.href = '/';
  };

  return (
    <html lang="el">
      <body className="bg-gray-900 text-white min-h-screen" style={{ margin: 0, padding: 0 }}>

        <nav className="bg-gradient-to-r from-gray-800 via-gray-900 to-black shadow-2xl border-b border-purple-500/20 relative z-50">
          <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">

              {/* Logo */}
              <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                <div className="text-2xl">🎓</div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">
                  UPatras e-Learning
                </h1>
              </Link>

              {/* Desktop nav */}
              <div className="hidden md:flex items-center space-x-4">

                {user?.role === 'lecturer' && (
                    <Link href="/courses"
                      className="text-gray-300 hover:text-purple-400 px-3 py-2 rounded-md text-sm font-medium transition-all duration-300 hover:bg-purple-500/10">
                      📖 Μαθήματα
                    </Link>
                )}

                {!isLoggedIn && (
                  <>
                    <Link href="/courses"
                      className="text-gray-300 hover:text-purple-400 px-3 py-2 rounded-md text-sm font-medium transition-all duration-300 hover:bg-purple-500/10">
                      📖 Μαθήματα
                    </Link>
                    <Link href="/register"
                      className="text-gray-300 hover:text-purple-400 px-3 py-2 rounded-md text-sm font-medium transition-all duration-300 hover:bg-purple-500/10">
                      Εγγραφή
                    </Link>
                    <Link href="/login"
                      className="bg-gradient-to-r from-purple-600 to-violet-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:from-purple-700 hover:to-violet-700 transition-all duration-300 shadow-lg">
                      Σύνδεση
                    </Link>
                  </>
                )}

                {isLoggedIn && (
                  <>
                    {/* Εγγραφή σε Μάθημα — μόνο για students */}
                    {user?.role === 'student' && (
                      <Link href="/enroll"
                        className="bg-gradient-to-r from-purple-600 to-violet-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:from-purple-700 hover:to-violet-700 transition-all duration-300 shadow-lg hover:shadow-purple-500/25 whitespace-nowrap">
                        ➕ Εγγραφή σε Μάθημα
                      </Link>
                    )}

                    <Link href={dashboardHref}
                      className="text-gray-300 hover:text-purple-400 px-3 py-2 rounded-md text-sm font-medium transition-all duration-300 hover:bg-purple-500/10">
                      {user?.role === 'lecturer' ? '🎓 Lecturer Panel' : user?.role === 'admin' ? '⚙️ Admin Panel' : '📚 Dashboard'}
                    </Link>

                    <Link href="/messages"
                      className="text-gray-300 hover:text-purple-400 px-3 py-2 rounded-md text-sm font-medium transition-all duration-300 hover:bg-purple-500/10">
                      💬 Μηνύματα
                    </Link>

                    <div className="text-gray-400 px-3 py-2 text-sm border-l border-purple-500/30">
                      👤 {user?.first_name || user?.email?.split('@')[0]}
                    </div>

                    <button onClick={handleLogout}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-all duration-300">
                      Αποσύνδεση
                    </button>
                  </>
                )}
              </div>

              {/* Mobile toggle */}
              <div className="md:hidden">
                <input type="checkbox" id="mobile-menu-toggle" className="hidden peer" />
                <label htmlFor="mobile-menu-toggle"
                  className="text-gray-300 hover:text-purple-400 focus:outline-none cursor-pointer block">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </label>

                <div className="absolute top-full left-0 right-0 hidden peer-checked:block">
                  <div className="mx-4 mt-2 px-2 pt-2 pb-3 space-y-1 bg-gray-800/95 backdrop-blur-sm rounded-lg border border-purple-500/20">

                    {!isLoggedIn && (
                      <>
                        <Link href="/courses"
                          className="text-gray-300 hover:text-purple-400 block px-3 py-2 rounded-md text-base font-medium transition-all">
                          📖 Μαθήματα
                        </Link>
                        <Link href="/register"
                          className="text-gray-300 hover:text-purple-400 block px-3 py-2 rounded-md text-base font-medium transition-all">
                          Εγγραφή
                        </Link>
                        <Link href="/login"
                          className="text-gray-300 hover:text-purple-400 block px-3 py-2 rounded-md text-base font-medium transition-all">
                          Σύνδεση
                        </Link>
                      </>
                    )}

                    {isLoggedIn && (
                      <>
                        {/* ★ Mobile — Εγγραφή σε Μάθημα ★ */}
                        <Link href="/enroll"
                          className="bg-gradient-to-r from-purple-600 to-violet-600 text-white block px-3 py-2 rounded-md text-base font-medium">
                          ➕ Εγγραφή σε Μάθημα
                        </Link>
                        <Link href={dashboardHref}
                          className="text-gray-300 hover:text-purple-400 block px-3 py-2 rounded-md text-base font-medium transition-all">
                          {user?.role === 'lecturer' ? '🎓 Lecturer Panel' : user?.role === 'admin' ? '⚙️ Admin Panel' : '📚 Dashboard'}
                        </Link>
                        {user?.role === 'admin' && (
                          <Link href="/admin"
                            className="text-gray-300 hover:text-purple-400 block px-3 py-2 rounded-md text-base font-medium transition-all">
                            ⚙️ Admin
                          </Link>
                        )}
                        <Link href="/messages"
                          className="text-gray-300 hover:text-purple-400 block px-3 py-2 rounded-md text-base font-medium transition-all">
                          💬 Μηνύματα
                        </Link>
                        <div className="text-gray-400 px-3 py-2 text-sm">
                          👤 {user?.email}
                        </div>
                        <button onClick={handleLogout}
                          className="bg-red-600 hover:bg-red-700 text-white w-full px-3 py-2 rounded-md text-base font-medium transition-all">
                          Αποσύνδεση
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50" />
        </nav>

        <div className="relative">{children}</div>

        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-20 right-20 w-96 h-96 bg-purple-600/10 rounded-full filter blur-3xl" />
          <div className="absolute bottom-20 left-20 w-80 h-80 bg-violet-600/10 rounded-full filter blur-3xl" />
        </div>

      </body>
    </html>
  );
}