'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import './course.css';

const DIFFICULTY_LABELS = {
  beginner:     { label: 'Αρχάριος',     color: 'diff-beginner' },
  intermediate: { label: 'Μέσος',        color: 'diff-intermediate' },
  advanced:     { label: 'Προχωρημένος', color: 'diff-advanced' },
};

const formatDuration = (mins) => {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}ω ${m > 0 ? m + 'λ' : ''}`.trim() : `${m}λ`;
};

export default function CoursePage() {
  const { id: courseId } = useParams();
  const router = useRouter();

  const [course, setCourse]         = useState(null);
  const [user, setUser]             = useState(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [enrolling, setEnrolling]   = useState(false);
  const [enrollError, setEnrollError] = useState(null);

  // Για enrolled mode
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [videoUrl, setVideoUrl]     = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload);
      } catch {}
    }

    // Φόρτωση course + enrollment check παράλληλα, render μόνο όταν έχουμε και τα δύο
    const coursePromise = fetch(`http://localhost:5000/api/courses/${courseId}`)
      .then(r => r.json());

    const enrollmentPromise = token
      ? fetch('http://localhost:5000/api/my-enrollments', {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()).catch(() => [])
      : Promise.resolve([]);

    Promise.all([coursePromise, enrollmentPromise])
      .then(([courseData, enrollments]) => {
        setCourse(courseData);
        if (Array.isArray(enrollments)) {
          const enrolled = enrollments.some(e => String(e.course_id) === String(courseId));
          setIsEnrolled(enrolled);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [courseId]);

  // Όταν ξέρουμε αν είναι enrolled, φορτώνουμε το κατάλληλο lesson
  useEffect(() => {
    if (!course) return;
    if (isEnrolled) {
      // Enrolled: επιλέγουμε πρώτο lesson
      const first = course.sections?.[0]?.lessons?.[0];
      if (first) loadLesson(first);
    } else {
      // Not enrolled: βρίσκουμε πρώτο free lesson για preview
      const freeLesson = course.sections
        ?.flatMap(s => s.lessons || [])
        .find(l => l.is_free && l.lesson_type === 'video');
      if (freeLesson) loadLesson(freeLesson);
    }
  }, [course, isEnrolled]);

  const loadLesson = (lesson) => {
    setSelectedLesson(lesson);
    setVideoUrl(null);
    setVideoError(null);
    if (lesson.lesson_type !== 'video') return;
    fetchVideo(lesson.id);
  };

  const fetchVideo = async (lessonId) => {
    setVideoLoading(true);
    const token = localStorage.getItem('token');
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`http://localhost:5000/api/lessons/${lessonId}/video`, { headers });
      const data = await res.json();
      if (res.ok && data.video_url) {
        // Εξαγωγή FILE_ID και κατασκευή σωστού preview URL
        const url = data.video_url;
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) {
          setVideoUrl(`https://drive.google.com/file/d/${match[1]}/preview`);
        } else {
          setVideoUrl(url); // fallback
        }
      } else {
        setVideoError(res.status === 403 ? 'locked' : 'no_video');
      }
    } catch {
      setVideoError('error');
    } finally {
      setVideoLoading(false);
    }
  };

  const handleEnroll = async () => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    setEnrolling(true);
    setEnrollError(null);
    try {
      const res = await fetch(`http://localhost:5000/api/courses/${courseId}/enroll`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setIsEnrolled(true);
      } else {
        setEnrollError(data.error || 'Σφάλμα εγγραφής');
      }
    } catch {
      setEnrollError('Σφάλμα σύνδεσης');
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) return (
    <div className="cp-loading"><div className="cp-spinner" /><p>Φόρτωση...</p></div>
  );
  if (!course) return (
    <div className="cp-loading"><p>Το μάθημα δεν βρέθηκε.</p></div>
  );

  const diff = DIFFICULTY_LABELS[course.difficulty] || { label: course.difficulty, color: '' };
  const totalLessons = course.sections?.reduce((s, sec) => s + (sec.lessons?.length || 0), 0) || 0;
  const isFree = !course.price || course.price === '0.00';

  // ─────────────────────────────────────
  // MODE A: ΕΓΓΕΓΡΑΜΜΕΝΟΣ — Learning view
  // ─────────────────────────────────────
  if (isEnrolled) {
    return (
      <div className="cp-layout">

        {/* Sidebar */}
        <aside className="cp-sidebar">
          <div className="cp-sidebar-header">
            <span className="cp-enrolled-badge">✅ Εγγεγραμμένος</span>
            <h2>{course.title}</h2>
            <div className="cp-sidebar-meta">
              <span>👤 {course.lecturer_name}</span>
              <span>🏛 {course.institution_name}</span>
            </div>
          </div>

          <div className="cp-sections">
            {course.sections?.map(section => (
              <div key={section.id} className="cp-section">
                <p className="cp-section-title">{section.title}</p>
                <ul>
                  {section.lessons?.map(lesson => (
                    <li key={lesson.id}>
                      <button
                        className={`cp-lesson-btn ${selectedLesson?.id === lesson.id ? 'active' : ''}`}
                        onClick={() => loadLesson(lesson)}
                      >
                        <span className="cp-lesson-icon">
                          {lesson.lesson_type === 'video' ? '▶' : '📄'}
                        </span>
                        <span className="cp-lesson-name">{lesson.title}</span>
                        {lesson.is_free && <span className="cp-free-tag">Δωρεάν</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Main - Video */}
        <main className="cp-main">
          {selectedLesson ? (
            <div className="cp-content">
              <h1>{selectedLesson.title}</h1>
              {selectedLesson.description && (
                <p className="cp-lesson-desc">{selectedLesson.description}</p>
              )}

              {selectedLesson.lesson_type === 'video' && (
                <div className="cp-video-wrap">
                  {videoLoading && (
                    <div className="cp-video-placeholder">
                      <div className="cp-spinner" /><p>Φόρτωση βίντεο...</p>
                    </div>
                  )}
                  {!videoLoading && videoUrl && (
                    <iframe
                      src={videoUrl}
                      className="cp-video-frame"
                      allow="autoplay"
                      allowFullScreen
                      title={selectedLesson.title}
                    />
                  )}
                  {!videoLoading && videoError === 'no_video' && (
                    <div className="cp-video-placeholder">
                      <span>📭</span><p>Δεν υπάρχει βίντεο ακόμα.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="cp-empty">
              <span>📚</span><p>Επιλέξτε μάθημα από αριστερά</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─────────────────────────────────────
  // MODE B: ΜΗ ΕΓΓΕΓΡΑΜΜΕΝΟΣ — Info + Preview
  // ─────────────────────────────────────
  return (
    <div className="cp-info-page">

      {/* Left: Course info */}
      <div className="cp-info-main">

        {/* Breadcrumb */}
        <p className="cp-breadcrumb">
          <Link href="/courses">← Μαθήματα</Link>
          {course.institution_name && <span> / {course.institution_name}</span>}
        </p>

        {/* Header */}
        <div className="cp-info-header">
          <div className="cp-info-badges">
            <span className="cp-category-badge">{course.category_name}</span>
            <span className={`cp-diff-badge ${diff.color}`}>{diff.label}</span>
          </div>
          <h1>{course.title}</h1>
          <p className="cp-info-desc">{course.description || course.short_description}</p>

          <div className="cp-info-meta-row">
            <span>👤 {course.lecturer_name}</span>
            <span>🏛 {course.institution_name}</span>
            <span>⏱ {formatDuration(course.duration_minutes)}</span>
            <span>📖 {totalLessons} μαθήματα</span>
            <span>👥 {course.enrolled_count || 0} εγγεγραμμένοι</span>
          </div>
        </div>

        {/* Free video preview */}
        {selectedLesson && (
          <div className="cp-preview-section">
            <p className="cp-preview-label">🎬 Preview — {selectedLesson.title}</p>
            <div className="cp-video-wrap">
              {videoLoading && (
                <div className="cp-video-placeholder">
                  <div className="cp-spinner" /><p>Φόρτωση...</p>
                </div>
              )}
              {!videoLoading && videoUrl && (
                <iframe
                  src={videoUrl}
                  className="cp-video-frame"
                  allow="autoplay"
                  allowFullScreen
                  title={selectedLesson.title}
                />
              )}
              {!videoLoading && !videoUrl && (
                <div className="cp-video-placeholder">
                  <span>📭</span><p>Δεν υπάρχει διαθέσιμο preview.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lessons list preview */}
        <div className="cp-lessons-preview">
          <h2>Περιεχόμενο μαθήματος</h2>
          {course.sections?.map(section => (
            <div key={section.id} className="cp-preview-section-block">
              <p className="cp-preview-section-title">📂 {section.title}</p>
              <ul>
                {section.lessons?.map(lesson => (
                  <li key={lesson.id} className="cp-preview-lesson-item">
                    <span>{lesson.lesson_type === 'video' ? '▶' : '📄'}</span>
                    <span>{lesson.title}</span>
                    {lesson.is_free && <span className="cp-free-tag">Δωρεάν</span>}
                    {!lesson.is_free && <span className="cp-locked-tag">🔒</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

      </div>

      {/* Right: Enroll card */}
      <aside className="cp-enroll-card">
        <div className="cp-price">
          {isFree ? <span className="cp-price-free">Δωρεάν</span> : <span className="cp-price-paid">{course.price}€</span>}
        </div>

        {enrollError && <p className="cp-enroll-error">{enrollError}</p>}

        {user ? (
          <button
            className="cp-enroll-cta"
            onClick={handleEnroll}
            disabled={enrolling}
          >
            {enrolling ? 'Εγγραφή...' : isFree ? '🆓 Εγγραφή Δωρεάν' : '💳 Εγγραφή'}
          </button>
        ) : (
          <Link href={`/login?redirect=/courses/${courseId}`} className="cp-enroll-cta">
            Σύνδεση για Εγγραφή
          </Link>
        )}

        <div className="cp-enroll-details">
          <div><span>👤</span><span>{course.lecturer_name}</span></div>
          <div><span>🏛</span><span>{course.institution_name}</span></div>
          <div><span>⏱</span><span>{formatDuration(course.duration_minutes)}</span></div>
          <div><span>📖</span><span>{totalLessons} μαθήματα</span></div>
          <div><span>🎓</span><span>Μέγιστοι: {course.max_students || '—'}</span></div>
          {course.learning_objectives?.length > 0 && (
            <>
              <hr className="cp-card-divider" />
              <p className="cp-card-section-title">Τι θα μάθεις</p>
              <ul className="cp-objectives">
                {course.learning_objectives.map((o, i) => (
                  <li key={i}>✓ {o}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>

    </div>
  );
}