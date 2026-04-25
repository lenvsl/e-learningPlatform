'use client';

import "./globals.css";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function RootLayout({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    checkAuth();
    window.addEventListener('storage', checkAuth);
    return () => window.removeEventListener('storage', checkAuth);
  }, []);

  useEffect(() => {
    if (user?.role === 'student') fetchNotifs();
  }, [user]);

  const fetchNotifs = async () => {
    const token = sessionStorage.getItem('token');
    if (!token) return;
    try {
      const data = await fetch('http://localhost:5000/api/my-notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json());
      if (Array.isArray(data)) {
        setNotifs(data);
        setUnread(data.filter(n => !n.is_read).length);
      }
    } catch {}
  };

  const markRead = async (id) => {
    const token = sessionStorage.getItem('token');
    await fetch(`http://localhost:5000/api/notifications/${id}/read`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
    });
    setNotifs(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
    setUnread(u => Math.max(0, u - 1));
  };

  const checkAuth = () => {
    const token = sessionStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(decodeURIComponent(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
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
                        className="text-gray-300 hover:text-purple-400 px-3 py-2 rounded-md text-sm font-medium transition-all duration-300 hover:bg-purple-500/10 whitespace-nowrap">
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

                    {user?.role === 'student' && (
                      <div style={{position:'relative'}}>
                        <button onClick={() => { setShowNotifs(v => !v); fetchNotifs(); }}
                          style={{background:'none',border:'none',cursor:'pointer',color:'#d1d5db',fontSize:'20px',padding:'6px',position:'relative'}}>
                          🔔
                          {unread > 0 && (
                            <span style={{position:'absolute',top:0,right:0,background:'#ef4444',color:'#fff',borderRadius:'50%',fontSize:'10px',width:'16px',height:'16px',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold'}}>
                              {unread}
                            </span>
                          )}
                        </button>
                        {showNotifs && (
                          <div style={{position:'absolute',right:0,top:'100%',width:'320px',background:'#1e293b',border:'1px solid #334155',borderRadius:'10px',boxShadow:'0 8px 24px rgba(0,0,0,0.4)',zIndex:100,maxHeight:'360px',overflowY:'auto'}}>
                            <div style={{padding:'12px 16px',borderBottom:'1px solid #334155',fontWeight:'bold',color:'#e2e8f0',fontSize:'14px'}}>
                              🔔 Ειδοποιήσεις
                            </div>
                            {notifs.length === 0 ? (
                              <div style={{padding:'20px',textAlign:'center',color:'#64748b',fontSize:'13px'}}>Καμία ειδοποίηση</div>
                            ) : notifs.map(n => (
                              <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
                                style={{padding:'12px 16px',borderBottom:'1px solid #1e293b',background:n.is_read?'transparent':'rgba(139,92,246,0.08)',cursor:n.is_read?'default':'pointer'}}>
                                <div style={{fontSize:'12px',color:'#7c3aed',marginBottom:'4px',fontWeight:'500'}}>{n.course_title}</div>
                                <div style={{fontSize:'13px',color:'#cbd5e1'}}>{n.message}</div>
                                <div style={{fontSize:'11px',color:'#475569',marginTop:'4px'}}>{new Date(n.created_at).toLocaleDateString('el-GR')}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

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
                        {user?.role === 'student' && (
                          <Link href="/enroll"
                            className="text-gray-300 hover:text-purple-400 block px-3 py-2 rounded-md text-base font-medium transition-all">
                            ➕ Εγγραφή σε Μάθημα
                          </Link>
                        )}
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