'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import './quiz.css';

export default function QuizPage() {
  const { id: quizId } = useParams();
  const router = useRouter();

  const [quiz, setQuiz]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [answers, setAnswers]   = useState({}); // { questionId: selectedOption }
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [progressBlocked, setProgressBlocked] = useState(false);
  const [courseId, setCourseId] = useState(null);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    const headers = { 'Authorization': `Bearer ${token}` };

    fetch(`http://localhost:5000/api/quizzes/${quizId}`, { headers })
      .then(r => r.json())
      .then(async data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        data.questions = (data.questions || []).map(q => ({
          ...q,
          options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
        }));
        setQuiz(data);
        setCourseId(data.course_id);

        // Έλεγχος προόδου
        if (data.course_id) {
          const enrollRes = await fetch('http://localhost:5000/api/my-enrollments', { headers });
          const enrollments = await enrollRes.json();
          const enrollment = Array.isArray(enrollments)
            ? enrollments.find(e => Number(e.course_id) === Number(data.course_id))
            : null;
          const progress = enrollment?.progress_percentage || 0;
          if (progress < 100) setProgressBlocked(true);
        }
        setLoading(false);
      })
      .catch(() => { setError('Σφάλμα φόρτωσης'); setLoading(false); });
  }, [quizId]);

  const selectAnswer = (questionId, optionIndex) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const toggleMultiAnswer = (questionId, optionIndex) => {
    setAnswers(prev => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const updated = current.includes(optionIndex)
        ? current.filter(i => i !== optionIndex)
        : [...current, optionIndex];
      return { ...prev, [questionId]: updated };
    });
  };

  const allAnswered = quiz?.questions?.length > 0 &&
    quiz.questions.every(q => {
      if (q.question_type === 'text') return true;
      if (q.question_type === 'multiple_choice') return Array.isArray(answers[q.id]) && answers[q.id].length > 0;
      return answers[q.id] !== undefined && answers[q.id] !== null;
    });

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setError(null);
    const token = sessionStorage.getItem('token');
    try {
      // Μετατροπή ανά τύπο ερώτησης
      const answersForSubmit = {};
      quiz.questions.forEach(q => {
        if (q.question_type === 'text') {
          answersForSubmit[q.id] = answers[q.id] || '';
        } else if (q.question_type === 'multiple_choice') {
          const indices = Array.isArray(answers[q.id]) ? answers[q.id] : [];
          answersForSubmit[q.id] = JSON.stringify([...new Set(indices.map(i => q.options[i]))].sort());
        } else {
          // single_choice
          if (answers[q.id] !== undefined) answersForSubmit[q.id] = q.options[answers[q.id]];
        }
      });
      const res = await fetch(`http://localhost:5000/api/quizzes/${quizId}/submit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersForSubmit })
      });
      const data = await res.json();
      if (res.ok) { setResult(data); }
      else { setError(data.error || 'Σφάλμα υποβολής'); }
    } catch { setError('Σφάλμα σύνδεσης'); }
    finally { setSubmitting(false); }
  };

  // ── Κλειδωμένο quiz ──
  if (!loading && progressBlocked) return (
    <div className="quiz-page">
      <div className="quiz-result">
        <div className="quiz-result-icon">🔒</div>
        <h1>Quiz κλειδωμένο</h1>
        <p style={{color:'#888', textAlign:'center'}}>
          Πρέπει να ολοκληρώσεις όλα τα μαθήματα του course πριν δώσεις το quiz.
        </p>
        <div className="quiz-result-actions">
          <Link href={`/courses/${courseId}`} className="quiz-btn-primary">📚 Πήγαινε στο μάθημα</Link>
        </div>
      </div>
    </div>
  );

  // ── Loading ──
  if (loading) return (
    <div className="quiz-loading"><div className="quiz-spinner" /><p>Φόρτωση quiz...</p></div>
  );

  if (error && !quiz) return (
    <div className="quiz-loading"><p style={{color:'#f87171'}}>{error}</p></div>
  );

  // ── Αναμονή βαθμολογίας ──
  if (quiz?.pending_grading) return (
    <div className="quiz-page">
      <div className="quiz-result">
        <div className="quiz-result-icon">⏳</div>
        <h1>Αναμονή βαθμολογίας</h1>
        <p style={{color:'#f59e0b', textAlign:'center'}}>
          Οι απαντήσεις σου υποβλήθηκαν και αναμένεται η βαθμολόγηση από τον καθηγητή.<br/>
          Θα ενημερωθείς όταν ολοκληρωθεί.
        </p>
        <div className="quiz-result-actions">
          <Link href="/dashboard" className="quiz-btn-primary">📚 Dashboard</Link>
        </div>
      </div>
    </div>
  );

  // ── Έχει ήδη περάσει ──
  if (quiz?.already_passed) return (
    <div className="quiz-page">
      <div className="quiz-result">
        <div className="quiz-result-icon">🎓</div>
        <h1>Έχεις ήδη περάσει αυτό το Quiz!</h1>
        <p style={{color:'#888'}}>Δεν μπορείς να ξαναδώσεις ένα quiz που έχεις ήδη περάσει.</p>
        <div className="quiz-result-actions">
          <Link href="/certificates" className="quiz-btn-primary">🏆 Τα Πιστοποιητικά μου</Link>
          <Link href="/dashboard" className="quiz-btn-ghost">📚 Dashboard</Link>
        </div>
      </div>
    </div>
  );

  // ── Προηγούμενη αποτυχημένη απόπειρα (επιστροφή στη σελίδα μετά βαθμολόγηση) ──
  if (quiz?.last_score !== null && quiz?.last_score !== undefined && !result && !retrying) return (
    <div className="quiz-page">
      <div className="quiz-result">
        <div className="quiz-result-icon">😕</div>
        <h1>Δεν πέρασες</h1>
        <div className="quiz-score-box">
          <div className="quiz-score-num">{quiz.last_score}%</div>
          <div className="quiz-score-pass">Βάση επιτυχίας: 70%</div>
        </div>
        <div className="quiz-result-actions">
          <button className="quiz-btn-primary" onClick={() => { setRetrying(true); setAnswers({}); }}>
            🔄 Προσπάθησε ξανά
          </button>
          <Link href="/dashboard" className="quiz-btn-ghost">📚 Dashboard</Link>
        </div>
      </div>
    </div>
  );

  // ── Αποτέλεσμα ──
  if (result) {
    const { passed, needs_grading } = result;
    return (
      <div className="quiz-page">
        <div className="quiz-result">
          <div className="quiz-result-icon">{needs_grading ? '⏳' : passed ? '🎓' : '😕'}</div>
          <h1>{needs_grading ? 'Απαντήσεις υποβλήθηκαν!' : passed ? 'Συγχαρητήρια!' : 'Δεν πέρασες'}</h1>

          {needs_grading ? (
            <p style={{color:'#f59e0b',textAlign:'center'}}>
              Κάποιες ερωτήσεις αξιολογούνται χειροκίνητα από τον καθηγητή.<br/>
              Θα ενημερωθείς για το αποτέλεσμα.
            </p>
          ) : (
            <div className="quiz-score-box">
              <div className="quiz-score-num">{result.score}%</div>
              <div className="quiz-score-detail">{result.correct_answers} / {result.auto_gradable ?? result.total_questions} σωστές</div>
              <div className="quiz-score-pass">Βάση επιτυχίας: {result.passing_score}%</div>
            </div>
          )}

          {passed && !needs_grading && (
            <div className="quiz-cert-banner">🎉 Το πιστοποιητικό σου είναι έτοιμο!</div>
          )}

          <div className="quiz-result-actions">
            {passed || needs_grading ? (
              <Link href="/dashboard" className="quiz-btn-primary">📚 Dashboard</Link>
            ) : (
              <>
                <button className="quiz-btn-primary"
                  onClick={() => { setResult(null); setAnswers({}); }}>
                  🔄 Προσπάθησε ξανά
                </button>
                <Link href="/dashboard" className="quiz-btn-ghost">📚 Dashboard</Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Quiz Form ──
  return (
    <div className="quiz-page">
      <div className="quiz-header">
        <h1>{quiz.title}</h1>
        <p>Βάση επιτυχίας: <strong>{quiz.passing_grade}%</strong> · {quiz.questions?.length} ερωτήσεις</p>
      </div>

      <div className="quiz-questions">
        {quiz.questions?.map((q, idx) => {
          const qType = q.question_type || 'single_choice';
          const isAnswered = qType === 'text' ? true
            : qType === 'multiple_choice' ? (Array.isArray(answers[q.id]) && answers[q.id].length > 0)
            : answers[q.id] !== undefined;
          return (
            <div key={q.id} className={`quiz-question ${isAnswered ? 'answered' : ''}`}>
              <p className="quiz-q-text">
                <span className="quiz-q-num">{idx + 1}.</span> {q.question_text}
                {qType === 'multiple_choice' && <span style={{fontSize:'12px',color:'#888',marginLeft:'8px'}}>(πολλές σωστές)</span>}
              </p>

              {/* single_choice */}
              {qType === 'single_choice' && (
                <div className="quiz-options">
                  {q.options.map((opt, oi) => {
                    const isSelected = answers[q.id] === oi;
                    return (
                      <button key={`q${q.id}-o${oi}`}
                        className={`quiz-option${isSelected ? ' selected' : ''}`}
                        onClick={() => selectAnswer(q.id, oi)} type="button">
                        <span className={`quiz-opt-letter${isSelected ? ' active' : ''}`}>{String.fromCharCode(65 + oi)}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* multiple_choice */}
              {qType === 'multiple_choice' && (
                <div className="quiz-options">
                  {q.options.map((opt, oi) => {
                    const selected = Array.isArray(answers[q.id]) && answers[q.id].includes(oi);
                    return (
                      <button key={`q${q.id}-o${oi}`}
                        className={`quiz-option${selected ? ' selected' : ''}`}
                        onClick={() => toggleMultiAnswer(q.id, oi)} type="button">
                        <span className={`quiz-opt-letter${selected ? ' active' : ''}`}>{String.fromCharCode(65 + oi)}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* text */}
              {qType === 'text' && (
                <textarea
                  className="quiz-text-answer"
                  rows={4}
                  placeholder="Γράψε την απάντησή σου εδώ..."
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="quiz-footer">
        <p className="quiz-progress">
          {Object.keys(answers).length} / {quiz.questions?.length} απαντήθηκαν
        </p>
        {error && <p className="quiz-error-msg">{error}</p>}
        <button
          className="quiz-btn-primary"
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          type="button"
        >
          {submitting ? 'Υποβολή...' : '✅ Υποβολή Quiz'}
        </button>
      </div>
    </div>
  );
}