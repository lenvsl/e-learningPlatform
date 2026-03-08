"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link'; //Link είναι το Next.js equivalent του <a> tag, πλοηγείται σε σελίδα της εφαρμογής σου χωρίς full page reload.

// Custom SVG Icons
const BookOpen = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const Users = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m3 5.197V9a3 3 0 00-6 0v2m6 0V9a3 3 0 016 0v2m-6 0h6" />
  </svg>
);

const Award = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
  </svg>
);

const Clock = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default function UniversityHero() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const features = [
    {
      icon: <BookOpen className="w-8 h-8" />,
      title: "Ακαδημαϊκή Αξιοπιστία",
      description: "Πρόσβαση σε μαθήματα που σχεδιάστηκαν και διδάσκονται από καθηγητές και ερευνητές του Πανεπιστημίου Πατρών."
    },
    {
      icon: <Clock className="w-8 h-8" />,
      title: "Ευελιξία",
      description: "Παρακολουθήστε βίντεο-μαθήματα, οπουδήποτε και όποτε θέλετε. Ισορροπήστε τις σπουδές σας με την προσωπική και επαγγελματική σας ζωή."
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: "Αλληλεπίδραση",
      description: "Συμμετέχετε σε συζητήσεις, κάνετε ερωτήσεις στους καθηγητές και συνεργαστείτε μέσα από την πλατφόρμα."
    },
    {
      icon: <Award className="w-8 h-8" />,
      title: "Αναγνώριση",
      description: "Αποκτήστε βεβαίωση συμμετοχής ή πιστοποιητικό ολοκλήρωσης για να ενισχύσετε το βιογραφικό σας."
    }
  ];

  return (
    <main className="w-screen w-full bg-gradient-to-br from-gray-900 via-black to-gray-900 relative overflow-hidden -mx-4 -my-4 px-4 py-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-purple-600 rounded-full mix-blend-screen filter blur-xl opacity-30" style={{animation: 'pulse 4s ease-in-out infinite'}}></div>
        <div className="absolute top-40 right-20 w-64 h-64 bg-violet-600 rounded-full mix-blend-screen filter blur-xl opacity-25" style={{animation: 'pulse 5s ease-in-out infinite', animationDelay: '2s'}}></div>
        <div className="absolute bottom-20 left-40 w-80 h-80 bg-indigo-600 rounded-full mix-blend-screen filter blur-xl opacity-20" style={{animation: 'pulse 6s ease-in-out infinite', animationDelay: '3s'}}></div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6">
        {/* Hero Section */}
        <div className={`text-center max-w-4xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent leading-tight">
            Αναπτύξτε τις γνώσεις σας,
            <span className="block text-4xl md:text-5xl mt-2">από παντού.</span>
          </h1>
          
          <p className="text-xl md:text-xl text-gray-300 mb-2 font-light leading-relaxed">
            Ένας κόσμος ακαδημαϊκών μαθημάτων από τα τμήματα του 
            <span className="font-semibold text-purple-400"> Πανεπιστημίου Πατρών</span>.
           </p>
           <p className="text-md text-gray-300 mb-12 font-light leading-relaxed">             
            <span className="font-semibold text-purple-400">
              Αποκτήστε επιπλέον δεξιότητες με certificate από το Πανεπιστήμιο Πατρών
            </span>.
           </p>
          <div className="mb-16">
            <Link 
              href="/courses"
              className="group bg-gradient-to-r from-purple-600 to-violet-600 text-white px-8 py-4 rounded-full text-lg font-semibold shadow-xl hover:shadow-2xl hover:shadow-purple-500/25 transform hover:scale-105 transition-all duration-300 hover:from-purple-700 hover:to-violet-700 inline-block"
            >
              Εξερευνήστε Μαθήματα
              <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`group bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:shadow-purple-500/20 transition-all duration-500 transform hover:scale-105 hover:-translate-y-2 hover:bg-gray-800/80 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}
              style={{ transitionDelay: `${index * 150}ms` }}
            >
              <div className="text-purple-400 mb-4 group-hover:scale-110 group-hover:text-violet-400 transition-all duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-3 group-hover:text-purple-400 transition-colors">
                {feature.title}
              </h3>
              <p className="text-gray-300 leading-relaxed text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className={`mt-16 text-center transition-all duration-1000 delay-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-gray-400 mb-4">Είστε έτοιμοι να ξεκινήσετε;</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-gray-800 text-purple-400 px-6 py-3 rounded-full font-semibold shadow-lg hover:shadow-xl hover:shadow-purple-500/20 transform hover:scale-105 transition-all duration-300 border-2 border-purple-400 hover:bg-purple-400 hover:text-white">
              Δωρεάν Δοκιμή
            </button>
            <button className="text-purple-400 px-6 py-3 rounded-full font-semibold hover:bg-gray-800/50 border border-purple-400/30 hover:border-purple-400 transition-all duration-300">
              Μάθετε Περισσότερα
            </button>
          </div>
        </div>
      </div>

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-purple-400 rounded-full opacity-30 animate-bounce"
            style={{
              left: `${20 + i * 15}%`,
              top: `${30 + (i % 2) * 40}%`,
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${4 + i * 0.7}s`
            }}
          />
        ))}
      </div>
    </main>
  );
}