'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './admin.css';

const API = 'http://localhost:5000';

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState('pending');

  // Users
  const [users, setUsers] = useState([]);
  // Categories
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [editCat, setEditCat] = useState(null); // { id, name }
  // Institutions
  const [institutions, setInstitutions] = useState([]);
  const [newInst, setNewInst] = useState({ name: '', description: '', website_url: '' });
  const [editInst, setEditInst] = useState(null);

  const token = () => sessionStorage.getItem('token');

  // Auth check
  useEffect(() => {
    const t = sessionStorage.getItem('token');
    if (!t) { router.push('/login'); return; }
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      if (payload.role !== 'admin') { router.push('/dashboard'); return; }
    } catch { router.push('/login'); }
  }, []);

  // Load data
  useEffect(() => { loadUsers(); loadCategories(); loadInstitutions(); }, []);

  const authHeaders = () => ({ 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' });

  async function loadUsers() {
    const r = await fetch(`${API}/api/admin/users`, { headers: authHeaders() });
    if (r.ok) setUsers(await r.json());
  }

  async function loadCategories() {
    const r = await fetch(`${API}/api/categories`);
    if (r.ok) setCategories(await r.json());
  }

  async function loadInstitutions() {
    const r = await fetch(`${API}/api/institutions`);
    if (r.ok) setInstitutions(await r.json());
  }

  async function changeRole(userId, role) {
    const r = await fetch(`${API}/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ role })
    });
    if (r.ok) loadUsers();
  }

  async function deleteUser(userId) {
    if (!confirm('Διαγραφή χρήστη;')) return;
    const r = await fetch(`${API}/api/admin/users/${userId}`, {
      method: 'DELETE', headers: authHeaders()
    });
    if (r.ok) loadUsers();
  }

  async function createCategory() {
    if (!newCatName.trim()) return;
    const r = await fetch(`${API}/api/admin/categories`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: newCatName.trim() })
    });
    if (r.ok) { setNewCatName(''); loadCategories(); }
  }

  async function updateCategory() {
    if (!editCat) return;
    const r = await fetch(`${API}/api/admin/categories/${editCat.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ name: editCat.name, is_active: true })
    });
    if (r.ok) { setEditCat(null); loadCategories(); }
  }

  async function deleteCategory(id) {
    if (!confirm('Διαγραφή κατηγορίας;')) return;
    const r = await fetch(`${API}/api/admin/categories/${id}`, {
      method: 'DELETE', headers: authHeaders()
    });
    if (r.ok) loadCategories();
  }

  async function createInstitution() {
    if (!newInst.name.trim()) return;
    const r = await fetch(`${API}/api/institutions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(newInst)
    });
    if (r.ok) { setNewInst({ name: '', description: '', website_url: '' }); loadInstitutions(); }
  }

  async function updateInstitution() {
    if (!editInst) return;
    const r = await fetch(`${API}/api/institutions/${editInst.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ ...editInst, is_active: true })
    });
    if (r.ok) { setEditInst(null); loadInstitutions(); }
  }

  async function deleteInstitution(id) {
    if (!confirm('Διαγραφή institution;')) return;
    const r = await fetch(`${API}/api/institutions/${id}`, {
      method: 'DELETE', headers: authHeaders()
    });
    if (r.ok) loadInstitutions();
  }

  const pending = users.filter(u => u.role === 'pending_lecturer');
  const allUsers = users.filter(u => !u.is_deleted);

  return (
    <div className="admin-page">
      <h1>⚙️ Admin Panel</h1>

      <div className="admin-tabs">
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          Εκκρεμείς Lecturers {pending.length > 0 && <span className="badge">{pending.length}</span>}
        </button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          Χρήστες
        </button>
        <button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>
          Κατηγορίες
        </button>
        <button className={tab === 'institutions' ? 'active' : ''} onClick={() => setTab('institutions')}>
          Institutions
        </button>
      </div>

      {/* PENDING LECTURERS */}
      {tab === 'pending' && (
        <div className="admin-section">
          <h2>Εκκρεμείς αιτήσεις Lecturer</h2>
          {pending.length === 0 ? (
            <p className="admin-empty">Δεν υπάρχουν εκκρεμείς αιτήσεις.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Όνομα</th><th>Email</th><th>Εγγραφή</th><th>Ενέργειες</th></tr>
              </thead>
              <tbody>
                {pending.map(u => (
                  <tr key={u.id}>
                    <td>{u.first_name} {u.last_name}</td>
                    <td>{u.email}</td>
                    <td>{new Date(u.created_at).toLocaleDateString('el-GR')}</td>
                    <td className="admin-actions">
                      <button className="btn-approve" onClick={() => changeRole(u.id, 'lecturer')}>✅ Έγκριση</button>
                      <button className="btn-reject" onClick={() => changeRole(u.id, 'student')}>❌ Απόρριψη</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ALL USERS */}
      {tab === 'users' && (
        <div className="admin-section">
          <h2>Διαχείριση Χρηστών</h2>
          <table className="admin-table">
            <thead>
              <tr><th>Όνομα</th><th>Email</th><th>Role</th><th>Ενέργειες</th></tr>
            </thead>
            <tbody>
              {allUsers.map(u => (
                <tr key={u.id}>
                  <td>{u.first_name} {u.last_name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      className="role-select"
                    >
                      <option value="student">Student</option>
                      <option value="lecturer">Lecturer</option>
                      <option value="admin">Admin</option>
                      <option value="pending_lecturer">Pending Lecturer</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn-delete" onClick={() => deleteUser(u.id)}>🗑 Διαγραφή</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CATEGORIES */}
      {tab === 'categories' && (
        <div className="admin-section">
          <h2>Κατηγορίες</h2>
          <div className="admin-form">
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Νέα κατηγορία..."
              onKeyDown={e => e.key === 'Enter' && createCategory()}
            />
            <button className="btn-create" onClick={createCategory}>+ Προσθήκη</button>
          </div>
          <table className="admin-table">
            <thead>
              <tr><th>Όνομα</th><th>Ενέργειες</th></tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td>
                    {editCat?.id === c.id ? (
                      <input
                        value={editCat.name}
                        onChange={e => setEditCat({ ...editCat, name: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && updateCategory()}
                        autoFocus
                      />
                    ) : c.name}
                  </td>
                  <td className="admin-actions">
                    {editCat?.id === c.id ? (
                      <>
                        <button className="btn-approve" onClick={updateCategory}>💾 Αποθήκευση</button>
                        <button className="btn-reject" onClick={() => setEditCat(null)}>Άκυρο</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-edit" onClick={() => setEditCat({ id: c.id, name: c.name })}>✏️ Επεξεργασία</button>
                        <button className="btn-delete" onClick={() => deleteCategory(c.id)}>🗑 Διαγραφή</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* INSTITUTIONS */}
      {tab === 'institutions' && (
        <div className="admin-section">
          <h2>Institutions</h2>
          <div className="admin-form admin-form-grid">
            <input value={newInst.name} onChange={e => setNewInst({ ...newInst, name: e.target.value })} placeholder="Όνομα *" />
            <input value={newInst.description} onChange={e => setNewInst({ ...newInst, description: e.target.value })} placeholder="Περιγραφή" />
            <input value={newInst.website_url} onChange={e => setNewInst({ ...newInst, website_url: e.target.value })} placeholder="Website URL" />
            <button className="btn-create" onClick={createInstitution}>+ Προσθήκη</button>
          </div>
          <table className="admin-table">
            <thead>
              <tr><th>Όνομα</th><th>Website</th><th>Ενέργειες</th></tr>
            </thead>
            <tbody>
              {institutions.map(inst => (
                <tr key={inst.id}>
                  <td>
                    {editInst?.id === inst.id ? (
                      <div className="edit-inline">
                        <input value={editInst.name} onChange={e => setEditInst({ ...editInst, name: e.target.value })} placeholder="Όνομα" />
                        <input value={editInst.description || ''} onChange={e => setEditInst({ ...editInst, description: e.target.value })} placeholder="Περιγραφή" />
                        <input value={editInst.website_url || ''} onChange={e => setEditInst({ ...editInst, website_url: e.target.value })} placeholder="Website" />
                      </div>
                    ) : inst.name}
                  </td>
                  <td>{inst.website_url ? <a href={inst.website_url} target="_blank" rel="noreferrer">{inst.website_url}</a> : '—'}</td>
                  <td className="admin-actions">
                    {editInst?.id === inst.id ? (
                      <>
                        <button className="btn-approve" onClick={updateInstitution}>💾 Αποθήκευση</button>
                        <button className="btn-reject" onClick={() => setEditInst(null)}>Άκυρο</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-edit" onClick={() => setEditInst({ ...inst })}>✏️ Επεξεργασία</button>
                        <button className="btn-delete" onClick={() => deleteInstitution(inst.id)}>🗑 Διαγραφή</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
