// // "use client";
// // import { useEffect, useState } from "react";
// // import { useRouter } from "next/navigation";

// // export default function DashboardPage() {
// //   const [user, setUser] = useState(null);
// //   const [error, setError] = useState("");
// //   const router = useRouter();

// //   useEffect(() => {
// //     const token = localStorage.getItem("token");
// //     if (!token) {
// //       router.push("/login");
// //       return;
// //     }

// //     fetch("http://localhost:5000/api/me", {
// //       headers: {
// //         Authorization: `Bearer ${token}`,
// //       },
// //     })
// //       .then((res) => res.json())
// //       .then((data) => {
// //         if (data.error) {
// //           setError(data.error);
// //           localStorage.removeItem("token");
// //           router.push("/login");
// //         } else {
// //           setUser(data);
// //         }
// //       })
// //       .catch(() => setError("Network error"));
// //   }, [router]);

// //   const handleLogout = () => {
// //     localStorage.removeItem("token");
// //     router.push("/login");
// //   };

// //   if (error) return <p className="p-6 text-red-500">{error}</p>;
// //   if (!user) return <p className="p-6">Loading...</p>;

// //   return (
// //     <main className="flex min-h-screen items-center justify-center p-6 text-black">
// //       <div className="bg-white shadow-md rounded p-6 space-y-4">
// //         <h1 className="text-2xl font-bold">Welcome, {user.first_name}!</h1>
// //         <p>Email: {user.email}</p>
// //         <p>Role: {user.role}</p>

// //         <button
// //           onClick={handleLogout}
// //           className="w-full bg-red-600 text-white p-2 rounded hover:bg-red-700"
// //         >
// //           Logout
// //         </button>
// //       </div>
// //     </main>
// //   );
// // }

// "use client";

// import { useState, useEffect } from 'react';
// import { useRouter } from "next/navigation";

// // Custom SVG Icons
// const BookOpen = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
//   </svg>
// );

// const Users = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m3 5.197V9a3 3 0 00-6 0v2m6 0V9a3 3 0 016 0v2m-6 0h6" />
//   </svg>
// );

// const Award = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
//   </svg>
// );

// const Clock = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
//   </svg>
// );

// const TrendingUp = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
//   </svg>
// );

// const Play = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15" />
//   </svg>
// );

// const LogOut = ({ className }) => (
//   <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
//     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
//   </svg>
// );

// export default function DashboardHome() {
//   const [isVisible, setIsVisible] = useState(false);
//   const [user, setUser] = useState(null);
//   const [error, setError] = useState("");
//   const [loading, setLoading] = useState(true);
//   const router = useRouter();

//   useEffect(() => {
//     const token = localStorage.getItem("token");
//     if (!token) {
//       router.push("/login");
//       return;
//     }

//     // Fetch user data
//     fetch("http://localhost:5000/api/me", {
//       headers: {
//         Authorization: `Bearer ${token}`,
//       },
//     })
//       .then((res) => res.json())
//       .then((data) => {
//         if (data.error) {
//           setError(data.error);
//           localStorage.removeItem("token");
//           localStorage.removeItem("userName");
//           router.push("/login");
//         } else {
//           setUser(data);
//           setLoading(false);
//           setIsVisible(true);
//         }
//       })
//       .catch(() => {
//         setError("Network error");
//         setLoading(false);
//       });
//   }, [router]);

//   const handleLogout = () => {
//     localStorage.removeItem("token");
//     localStorage.removeItem("userName");
//     router.push("/login");
//   };

//   // Show loading or error states
//   if (loading) {
//     return (
//       <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
//         <div className="text-white text-xl">Loading...</div>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
//         <div className="text-red-500 text-xl">{error}</div>
//       </div>
//     );
//   }

//   // if (!user) {
//   //   return null;
//   // }

//   if (!user) return (
//   <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
//     <p className="text-gray-400">Loading user...</p>
//   </div>
// );

//   const stats = [
//     {
//       title: "Ενεργά Μαθήματα",
//       value: "5",
//       change: "+2 αυτόν τον μήνα",
//       icon: <BookOpen className="w-8 h-8" />,
//       color: "from-blue-500 to-blue-600"
//     },
//     {
//       title: "Ώρες Μάθησης",
//       value: "24.5",
//       change: "+5.2 αυτή την εβδομάδα",
//       icon: <Clock className="w-8 h-8" />,
//       color: "from-purple-500 to-purple-600"
//     },
//     {
//       title: "Πρόοδος",
//       value: "78%",
//       change: "+12% τον τελευταίο μήνα",
//       icon: <TrendingUp className="w-8 h-8" />,
//       color: "from-green-500 to-green-600"
//     },
//     {
//       title: "Πιστοποιητικά",
//       value: "3",
//       change: "+1 αυτόν τον μήνα",
//       icon: <Award className="w-8 h-8" />,
//       color: "from-yellow-500 to-yellow-600"
//     }
//   ];

//   const recentCourses = [
//     {
//       title: "Δομές Δεδομένων",
//       progress: 85,
//       timeLeft: "2 ώρες",
//       department: "Τμήμα Πληροφορικής"
//     },
//     {
//       title: "Μαθηματικά ΙΙ",
//       progress: 62,
//       timeLeft: "5.5 ώρες",
//       department: "Τμήμα Μαθηματικών"
//     },
//     {
//       title: "Φυσική Ι",
//       progress: 91,
//       timeLeft: "1 ώρα",
//       department: "Τμήμα Φυσικής"
//     }
//   ];

//   const quickActions = [
//     {
//       title: "Εξερευνήστε Μαθήματα",
//       description: "Ανακαλύψτε νέα μαθήματα",
//       icon: <BookOpen className="w-6 h-6" />,
//       action: "Περιήγηση"
//     },
//     {
//       title: "Συνέχεια Μάθησης",
//       description: "Συνεχίστε από εκεί που σταματήσατε",
//       icon: <Play className="w-6 h-6" />,
//       action: "Συνέχεια"
//     },
//     {
//       title: "Κοινότητα",
//       description: "Συνδεθείτε με άλλους φοιτητές",
//       icon: <Users className="w-6 h-6" />,
//       action: "Συμμετοχή"
//     }
//   ];

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 relative" style={{width: '100vw', marginLeft: 'calc(-50vw + 50%)'}}>
//       {/* Background decorative elements */}
//       <div className="absolute inset-0 overflow-hidden pointer-events-none">
//         <div className="absolute top-20 right-20 w-96 h-96 bg-purple-600/10 rounded-full filter blur-3xl opacity-30" style={{animation: 'pulse 6s ease-in-out infinite'}}></div>
//         <div className="absolute bottom-20 left-20 w-80 h-80 bg-violet-600/10 rounded-full filter blur-3xl opacity-20" style={{animation: 'pulse 8s ease-in-out infinite', animationDelay: '2s'}}></div>
//       </div>

//       {/* Logout Button
//       <div className="absolute top-6 right-6 z-20">
//         <button
//           onClick={handleLogout}
//           className="bg-red-600/80 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-all duration-300 flex items-center space-x-2 backdrop-blur-sm"
//         >
//           <LogOut className="w-4 h-4" />
//           <span>Αποσύνδεση</span>
//         </button>
//       </div> */}

//       <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
//         {/* Welcome Header */}
//         <div className={`mb-8 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
//           <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
//             Καλώς ήρθες, 
//             <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent"> {user.first_name || user.name}!</span>
//           </h1>
//           <p className="text-xl text-gray-400">
//             Συνέχισε το ταξίδι μάθησής σου στο Πανεπιστήμιο Πατρών
//           </p>
//           <p className="text-lg text-gray-500 mt-2">
//             Email: {user.email} | Ρόλος: {user.role}
//           </p>
//         </div>

//         {/* Stats Grid */}
//         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
//           {stats.map((stat, index) => (
//             <div
//               key={index}
//               className={`bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 hover:bg-gray-800/80 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/20 ${
//                 isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
//               }`}
//               style={{ transitionDelay: `${index * 100}ms` }}
//             >
//               <div className="flex items-center justify-between mb-4">
//                 <div className={`p-3 rounded-lg bg-gradient-to-r ${stat.color}`}>
//                   <div className="text-white">
//                     {stat.icon}
//                   </div>
//                 </div>
//               </div>
//               <h3 className="text-2xl font-bold text-white mb-1">{stat.value}</h3>
//               <p className="text-gray-400 text-sm mb-2">{stat.title}</p>
//               <p className="text-purple-400 text-xs">{stat.change}</p>
//             </div>
//           ))}
//         </div>

//         <div className="grid lg:grid-cols-3 gap-8">
//           {/* Recent Courses */}
//           <div className="lg:col-span-2">
//             <div className={`bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 transition-all duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
//               <h2 className="text-2xl font-bold text-white mb-6">Πρόσφατα Μαθήματα</h2>
//               <div className="space-y-4">
//                 {recentCourses.map((course, index) => (
//                   <div key={index} className="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700/70 transition-all duration-300">
//                     <div className="flex justify-between items-start mb-3">
//                       <div>
//                         <h3 className="text-lg font-semibold text-white">{course.title}</h3>
//                         <p className="text-purple-400 text-sm">{course.department}</p>
//                       </div>
//                       <div className="text-right">
//                         <p className="text-white font-bold">{course.progress}%</p>
//                         <p className="text-gray-400 text-xs">{course.timeLeft} απομένουν</p>
//                       </div>
//                     </div>
//                     <div className="w-full bg-gray-600 rounded-full h-2">
//                       <div 
//                         className="bg-gradient-to-r from-purple-500 to-violet-500 h-2 rounded-full transition-all duration-1000"
//                         style={{ width: `${course.progress}%` }}
//                       ></div>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//               <button className="w-full mt-6 bg-gradient-to-r from-purple-600 to-violet-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-violet-700 transition-all duration-300 font-semibold">
//                 Δες Όλα τα Μαθήματα
//               </button>
//             </div>
//           </div>

//           {/* Quick Actions */}
//           <div className="lg:col-span-1">
//             <div className={`bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
//               <h2 className="text-2xl font-bold text-white mb-6">Γρήγορες Ενέργειες</h2>
//               <div className="space-y-4">
//                 {quickActions.map((action, index) => (
//                   <div key={index} className="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700/70 transition-all duration-300 cursor-pointer group">
//                     <div className="flex items-center space-x-3 mb-2">
//                       <div className="text-purple-400 group-hover:text-violet-400 transition-colors">
//                         {action.icon}
//                       </div>
//                       <h3 className="font-semibold text-white group-hover:text-purple-400 transition-colors">{action.title}</h3>
//                     </div>
//                     <p className="text-gray-400 text-sm mb-3">{action.description}</p>
//                     <button className="text-purple-400 text-sm font-semibold hover:text-violet-400 transition-colors">
//                       {action.action} →
//                     </button>
//                   </div>
//                 ))}
//               </div>
//             </div>

//             {/* Quick Stats */}
//             <div className={`bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 mt-6 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
//               <h3 className="text-lg font-bold text-white mb-4">Στατιστικά Εβδομάδας</h3>
//               <div className="space-y-3">
//                 <div className="flex justify-between">
//                   <span className="text-gray-400">Ώρες μάθησης:</span>
//                   <span className="text-white font-semibold">12.5h</span>
//                 </div>
//                 <div className="flex justify-between">
//                   <span className="text-gray-400">Ασκήσεις:</span>
//                   <span className="text-white font-semibold">23/30</span>
//                 </div>
//                 <div className="flex justify-between">
//                   <span className="text-gray-400">Streak:</span>
//                   <span className="text-purple-400 font-semibold">7 μέρες 🔥</span>
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }



'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import './dashboard.css';

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    enrolledCourses: 0,
    completedLessons: 0,
    certificates: 0,
    averageProgress: 0
  });
  const [courses, setCourses] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      router.push('/login');
      return;
    }

    // Get user from token
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUser(payload);
      
      if (payload.role !== 'student') {
        // Redirect non-students
        router.push('/lecturer-dashboard');
        return;
      }
      
      fetchDashboardData(token);
    } catch (err) {
      console.error('Invalid token');
      router.push('/login');
    }
  }, []);

  const fetchDashboardData = async (token) => {
    try {
      // Fetch enrolled courses
      const coursesRes = await fetch('http://localhost:5000/api/my-courses', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const coursesData = await coursesRes.json();
      
      // Fetch certificates
      const certsRes = await fetch('http://localhost:5000/api/my-certificates', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const certsData = await certsRes.json();
      
      // Calculate stats
      const totalProgress = coursesData.reduce((sum, c) => sum + (c.progress || 0), 0);
      const avgProgress = coursesData.length > 0 ? Math.round(totalProgress / coursesData.length) : 0;
      
      setCourses(coursesData.slice(0, 4)); // Show top 4
      setCertificates(certsData.slice(0, 3)); // Show top 3
      setStats({
        enrolledCourses: coursesData.length,
        completedLessons: coursesData.reduce((sum, c) => sum + (c.completed_lessons || 0), 0),
        certificates: certsData.length,
        averageProgress: avgProgress
      });
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="student-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Welcome back, {user?.first_name || 'Student'}! 👋</h1>
          <p className="subtitle">Here's what's happening with your courses</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📚</div>
          <div className="stat-content">
            <h3>{stats.enrolledCourses}</h3>
            <p>Enrolled Courses</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>{stats.completedLessons}</h3>
            <p>Lessons Completed</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div className="stat-content">
            <h3>{stats.certificates}</h3>
            <p>Certificates Earned</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <h3>{stats.averageProgress}%</h3>
            <p>Average Progress</p>
          </div>
        </div>
      </div>

      {/* My Courses */}
      <div className="section">
        <div className="section-header">
          <h2>My Courses</h2>
          <Link href="/courses" className="view-all-link">
            View All →
          </Link>
        </div>

        {courses.length === 0 ? (
          <div className="empty-state">
            <p>📚 You haven't enrolled in any courses yet</p>
            <Link href="/courses" className="btn-primary">
              Browse Courses
            </Link>
          </div>
        ) : (
          <div className="courses-grid">
            {courses.map(course => (
              <div key={course.id} className="course-card">
                <div className="course-header">
                  <h3>{course.title}</h3>
                  <span className="course-category">{course.category_name}</span>
                </div>
                
                <p className="course-description">
                  {course.description?.substring(0, 100)}...
                </p>

                <div className="course-meta">
                  <span>👨‍🏫 {course.lecturer_name}</span>
                  <span>📖 {course.total_lessons || 0} lessons</span>
                </div>

                <div className="progress-section">
                  <div className="progress-bar-wrapper">
                    <div 
                      className="progress-bar-fill" 
                      style={{ width: `${course.progress || 0}%` }}
                    ></div>
                  </div>
                  <span className="progress-text">{course.progress || 0}% Complete</span>
                </div>

                <Link 
                  href={`/courses/${course.id}`} 
                  className="btn-continue"
                >
                  Continue Learning →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Certificates */}
      <div className="section">
        <div className="section-header">
          <h2>Certificates</h2>
          <Link href="/certificates" className="view-all-link">
            View All →
          </Link>
        </div>

        {certificates.length === 0 ? (
          <div className="empty-state">
            <p>🏆 Complete courses to earn certificates!</p>
            <p className="empty-hint">Get 70% or higher to earn a certificate</p>
          </div>
        ) : (
          <div className="certificates-grid">
            {certificates.map(cert => (
              <div key={cert.id} className="certificate-card">
                <div className="cert-icon">🏆</div>
                <h3>{cert.course_title}</h3>
                <p className="cert-date">
                  Earned on {new Date(cert.issued_at).toLocaleDateString()}
                </p>
                <div className="cert-score">
                  Final Score: <strong>{cert.final_score}%</strong>
                </div>
                <Link 
                  href={`/certificates/${cert.id}`}
                  className="btn-view-cert"
                >
                  View Certificate
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="actions-grid">
          <Link href="/courses" className="action-card">
            <div className="action-icon">🔍</div>
            <h3>Browse Courses</h3>
            <p>Discover new learning opportunities</p>
          </Link>

          <Link href="/messages" className="action-card">
            <div className="action-icon">💬</div>
            <h3>Messages</h3>
            <p>Chat with your lecturers</p>
          </Link>

          <Link href="/certificates" className="action-card">
            <div className="action-icon">🏆</div>
            <h3>My Certificates</h3>
            <p>View your achievements</p>
          </Link>
        </div>
      </div>
    </div>
  );
}