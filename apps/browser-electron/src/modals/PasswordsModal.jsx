// Passwords Modal - Password Manager UI

import { useState } from 'react';
import { usePasswordStore } from '../stores/passwords';

export function PasswordsModal({ onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    url: '',
    username: '',
    password: '',
    notes: '',
  });

  const passwords = usePasswordStore((s) => s.passwords);
  const addPassword = usePasswordStore((s) => s.addPassword);
  const updatePassword = usePasswordStore((s) => s.updatePassword);
  const deletePassword = usePasswordStore((s) => s.deletePassword);
  const search = usePasswordStore((s) => s.search);

  const filteredPasswords = searchQuery ? search(searchQuery) : passwords;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      updatePassword(editingId, formData);
      setEditingId(null);
    } else {
      addPassword(formData.url, formData.username, formData.password, formData.notes);
    }
    setFormData({ url: '', username: '', password: '', notes: '' });
    setShowAddForm(false);
  };

  const handleEdit = (pwd) => {
    setFormData({
      url: pwd.url,
      username: pwd.username,
      password: pwd.password,
      notes: pwd.notes || '',
    });
    setEditingId(pwd.id);
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setFormData({ url: '', username: '', password: '', notes: '' });
    setEditingId(null);
    setShowAddForm(false);
  };

  const getDomain = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <h2 className="text-lg font-semibold">Password Manager</h2>
            <span className="text-sm text-gray-500">({passwords.length})</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search and Add */}
        <div className="p-4 border-b space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search passwords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>

          {/* Add/Edit Form */}
          {showAddForm && (
            <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="url" placeholder="URL (e.g., https://github.com)"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required />
                <input type="text" placeholder="Username / Email"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required />
              </div>
              <input type="password" placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required />
              <textarea placeholder="Notes (optional)"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={handleCancel}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
                <button type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                  {editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Passwords List */}
        <div className="flex-1 overflow-y-auto">
          {filteredPasswords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <p>{searchQuery ? 'No passwords found' : 'No saved passwords'}</p>
              <p className="text-sm mt-1">Click Add to save your first password</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="text-left text-sm text-gray-500 bg-gray-50 sticky top-0">
                <tr className="border-b">
                  <th className="p-3 font-medium">Site</th>
                  <th className="p-3 font-medium">Username</th>
                  <th className="p-3 font-medium w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPasswords.map((pwd) => (
                  <tr key={pwd.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      <p className="font-medium">{getDomain(pwd.url)}</p>
                      <p className="text-xs text-gray-500 truncate">{pwd.url}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-sm">{pwd.username}</p>
                      <p className="text-xs text-gray-400">
                        {pwd.password.replace(/./g, '•')}
                      </p>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => navigator.clipboard.writeText(pwd.password)}
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                          title="Copy password">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button onClick={() => handleEdit(pwd)}
                          className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded"
                          title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => deletePassword(pwd.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                          title="Delete">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t text-xs text-gray-400 text-center">
          Passwords are stored locally in your browser
        </div>
      </div>
    </div>
  );
}
