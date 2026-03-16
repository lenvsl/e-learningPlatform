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

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    fetch(`http://localhost:5000/api/quizzes/${quizId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); }
        else {
          // Κάνε parse τα options αν είναι string
          data.questions = (data.questions || []).map(q => ({
            ...q,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
          }));
          setQuiz(data);
        }
        setLoading(false);
      })
      .catch(() => { setError('Σφάλμα φόρτωσης'); setLoading(false); });
  }, [quizId]);

  const selectAnswer = (questionId, optionIndex) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const allAnswered = quiz?.questions?.length > 0 &&
    quiz.questions.every(q => answers[q.id] !== undefined && answers[q.id] !== null);

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setError(null);
    const token = sessionStorage.getItem('token');
    try {
      // Μετατροπή index → κείμενο option για το backend
      const answersForSubmit = {};
      quiz.questions.forEach(q => {
        if (answers[q.id] !== undefined) {
          answersForSubmit[q.id] = q.options[answers[q.id]];
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

  // ── Loading ──
  if (loading) return (
    <div className="quiz-loading"><div className="quiz-spinner" /><p>Φόρτωση quiz...</p></div>
  );

  if (error && !quiz) return (
    <div className="quiz-loading"><p style={{color:'#f87171'}}>{error}</p></div>
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

  // ── Αποτέλεσμα ──
  if (result) {
    const passed = result.passed;
    return (
      <div className="quiz-page">
        <div className="quiz-result">
          <div className="quiz-result-icon">{passed ? '🎓' : '😕'}</div>
          <h1>{passed ? 'Συγχαρητήρια!' : 'Δεν πέρασες'}</h1>

          <div className="quiz-score-box">
            <div className="quiz-score-num">{result.score}%</div>
            <div className="quiz-score-detail">{result.correct_answers} / {result.total_questions} σωστές</div>
            <div className="quiz-score-pass">Βάση επιτυχίας: {result.passing_score}%</div>
          </div>

          {passed && (
            <div className="quiz-cert-banner">🎉 Το πιστοποιητικό σου είναι έτοιμο!</div>
          )}

          <div className="quiz-result-actions">
            {passed ? (
              <Link href="/dashboard" className="quiz-btn-primary">🎓 Πήγαινε στο Dashboard</Link>
            ) : (
              <>
                <button className="quiz-btn-primary"
                  onClick={() => { setResult(null); setAnswers({}); }}>
                  🔄 Ξαναπροσπάθεια
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
        {quiz.questions?.map((q, idx) => (
          <div key={q.id} className={`quiz-question ${answers[q.id] ? 'answered' : ''}`}>
            <p className="quiz-q-text">
              <span className="quiz-q-num">{idx + 1}.</span> {q.question_text}
            </p>
            <div className="quiz-options">
              {q.options.map((opt, oi) => {
                const isSelected = answers[q.id] === oi;
                return (
                  <button
                    key={`q${q.id}-o${oi}`}
                    className={`quiz-option${isSelected ? ' selected' : ''}`}
                    onClick={() => selectAnswer(q.id, oi)}
                    type="button"
                  >
                    <span className={`quiz-opt-letter${isSelected ? ' active' : ''}`}>
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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