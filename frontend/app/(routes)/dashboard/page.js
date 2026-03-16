'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import './dashboard.css';

const DIFFICULTY_LABELS = {
  beginner:     { label: 'Αρχάριος',     color: 'diff-beginner' },
  intermediate: { label: 'Μέσος',        color: 'diff-intermediate' },
  advanced:     { label: 'Προχωρημένος', color: 'diff-advanced' },
};

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser]               = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role !== 'student') { router.push('/login'); return; }
      setUser(payload);
      fetchData(token);
    } catch {
      router.push('/login');
    }
  }, []);

  const fetchData = async (token) => {
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      const [enrollRes, certRes] = await Promise.all([
        fetch('http://localhost:5000/api/my-enrollments', { headers }),
        fetch('http://localhost:5000/api/my-certificates', { headers }),
      ]);
      const [enrollData, certData] = await Promise.all([
        enrollRes.json(),
        certRes.json(),
      ]);
      setEnrollments(Array.isArray(enrollData) ? enrollData : []);
      setCertificates(Array.isArray(certData) ? certData : []);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const avgProgress = enrollments.length > 0
    ? Math.round(enrollments.reduce((s, e) => s + (e.progress_percentage || 0), 0) / enrollments.length)
    : 0;

  const stats = [
    { icon: '📚', value: enrollments.length,  label: 'Εγγεγραμμένα Μαθήματα' },
    { icon: '📈', value: `${avgProgress}%`,   label: 'Μέση Πρόοδος' },
    { icon: '🏆', value: certificates.length, label: 'Πιστοποιητικά', href: '/certificates' },
    { icon: '✅', value: enrollments.filter(e => e.status === 'completed').length, label: 'Ολοκληρωμένα' },
  ];

  const quickActions = [
    { icon: '➕', label: 'Εγγραφή σε Μάθημα',    desc: 'Βρες και εγγράψου σε νέο μάθημα', href: '/enroll' },
    { icon: '🔍', label: 'Εξερεύνηση Μαθημάτων', desc: 'Δες όλα τα διαθέσιμα μαθήματα',  href: '/courses' },
    { icon: '💬', label: 'Μηνύματα',              desc: 'Επικοινωνήστε με καθηγητές',       href: '/messages' },
    { icon: '🏆', label: 'Πιστοποιητικά',         desc: 'Δες τα πιστοποιητικά σου',        href: '/certificates' },
  ];

  if (loading) return (
    <div className="db-loading">
      <div className="db-spinner" />
      <p>Φόρτωση...</p>
    </div>
  );

  return (
    <div className="db-page">

      {/* Welcome */}
      <div className="db-welcome">
        <div>
          <h1>Welcome back, <span>{user?.first_name || 'Student'}</span>! 👋</h1>
          <p>Καλή συνέχεια στην πορεία σου</p>
        </div>
      </div>

      {/* Stats */}
      <div className="db-stats">
        {stats.map((s, i) => (
          s.href ? (
            <Link key={i} href={s.href} className="db-stat-card" style={{ textDecoration:'none' }}>
              <span className="db-stat-icon">{s.icon}</span>
              <div>
                <strong>{s.value}</strong>
                <p>{s.label}</p>
              </div>
            </Link>
          ) : (
            <div key={i} className="db-stat-card">
              <span className="db-stat-icon">{s.icon}</span>
              <div>
                <strong>{s.value}</strong>
                <p>{s.label}</p>
              </div>
            </div>
          )
        ))}
      </div>

      {/* My Courses */}
      <div className="db-section">
        <div className="db-section-header">
          <h2>Τα Μαθήματά μου</h2>
          <Link href="/courses" className="db-link">Εξερεύνηση →</Link>
        </div>

        {enrollments.length === 0 ? (
          <div className="db-empty">
            <p>Δεν έχεις εγγραφεί σε κανένα μάθημα ακόμα.</p>
            <Link href="/courses" className="db-btn-primary">Εξερεύνηση Μαθημάτων</Link>
          </div>
        ) : (
          <div className="db-courses-grid">
            {enrollments.map(e => {
              const diff = DIFFICULTY_LABELS[e.difficulty] || { label: e.difficulty, color: '' };
              const progress = e.progress_percentage || 0;
              return (
                <Link key={e.enrollment_id} href={`/courses/${e.course_id}`} className="db-course-card">
                  <div className="db-course-top">
                    <span className={`db-diff ${diff.color}`}>{diff.label}</span>
                    <span className="db-course-status">{e.status === 'completed' ? '✅ Ολοκληρώθηκε' : '📖 Σε εξέλιξη'}</span>
                  </div>

                  <h3>{e.title}</h3>
                  <p className="db-course-desc">{e.short_description}</p>

                  <div className="db-progress-wrap">
                    <div className="db-progress-bar">
                      <div className="db-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="db-progress-label">{progress}%</span>
                  </div>

                  <div className="db-course-meta">
                    <span>👤 {e.lecturer_name}</span>
                    <span>📖 {e.lesson_count || 0} μαθήματα</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="db-section">
        <h2 className="db-section-title">Γρήγορες Ενέργειες</h2>
        <div className="db-actions">
          {quickActions.map((a, i) => (
            <Link key={i} href={a.href} className="db-action-card">
              <span className="db-action-icon">{a.icon}</span>
              <strong>{a.label}</strong>
              <p>{a.desc}</p>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}