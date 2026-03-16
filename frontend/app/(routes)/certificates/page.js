'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CertificatesPage() {
  const router = useRouter();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    fetch('http://localhost:5000/api/my-certificates', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        setCertificates(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', background:'#0f0f1e' }}>
      <div style={{ width:36, height:36, border:'3px solid #2d2d44', borderTopColor:'#667eea', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'40px 24px 60px', minHeight:'100vh', background:'#0f0f1e' }}>
      <div style={{ marginBottom:32 }}>
        <Link href="/dashboard" style={{ color:'#667eea', fontSize:14, textDecoration:'none' }}>← Πίσω στο Dashboard</Link>
        <h1 style={{ color:'#fff', fontSize:28, fontWeight:700, margin:'12px 0 4px' }}>🏆 Τα Πιστοποιητικά μου</h1>
        <p style={{ color:'#888', margin:0 }}>{certificates.length} πιστοποιητικά</p>
      </div>

      {certificates.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 24px', background:'#1a1a2e', borderRadius:16, border:'1px solid #2d2d44' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📜</div>
          <p style={{ color:'#888', marginBottom:20 }}>Δεν έχεις πιστοποιητικά ακόμα.</p>
          <Link href="/courses" style={{ background:'linear-gradient(135deg,#667eea,#764ba2)', color:'#fff', padding:'12px 28px', borderRadius:8, textDecoration:'none', fontWeight:600 }}>
            Εξερεύνηση Μαθημάτων
          </Link>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:20 }}>
          {certificates.map(cert => (
            <div key={cert.id} style={{ background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:16, padding:24, display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize:40, textAlign:'center' }}>🎓</div>
              <h3 style={{ color:'#fff', margin:0, fontSize:16, fontWeight:700, textAlign:'center' }}>{cert.course_title}</h3>
              <div style={{ background:'rgba(102,126,234,0.1)', border:'1px solid rgba(102,126,234,0.3)', borderRadius:8, padding:'10px 16px', textAlign:'center' }}>
                <span style={{ color:'#667eea', fontSize:24, fontWeight:800 }}>{cert.final_grade}%</span>
                <p style={{ color:'#888', fontSize:12, margin:'4px 0 0' }}>Τελικός Βαθμός</p>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <p style={{ color:'#666', fontSize:12, margin:0 }}>
                  📅 Εκδόθηκε: {new Date(cert.issued_at).toLocaleDateString('el-GR')}
                </p>
                <p style={{ color:'#666', fontSize:12, margin:0 }}>
                  ✅ Ολοκλήρωση: {cert.completed_at ? new Date(cert.completed_at).toLocaleDateString('el-GR') : '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
