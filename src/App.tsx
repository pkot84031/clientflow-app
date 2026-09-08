import { useEffect, useState } from 'react';
import { supabase } from './supabase';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

interface Project {
  id: string;
  title: string;
  client_name: string;
  status: 'In Progress' | 'Review' | 'Done';
  link: string;
  user_id?: string;
}

interface Comment {
  id: string;
  project_id: string;
  author: 'client' | 'executor';
  text: string;
  created_at: string;
}

const APP_DOMAIN = 'https://clientflow-app-indol.vercel.app';

export default function App() {
  const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;

  const [userName, setUserName] = useState<string>('Пользователь');
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Режим клиента
  const [clientProjectId, setClientProjectId] = useState<string | null>(null);
  const [clientProject, setClientProject] = useState<Project | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Чат / Комментарии
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null); // <-- Новое состояние для исполнителя

  // Форма
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newLink, setNewLink] = useState('');

  // Отправка уведомления в Telegram
 const sendTelegramNotification = async (chatId: string | undefined, text: string) => {
    console.log("📢 Отправка уведомления...", { chatId, hasToken: !!BOT_TOKEN, text });
    
    if (!BOT_TOKEN) {
      console.warn("❌ Ошибка: Не найден токен бота (VITE_TELEGRAM_BOT_TOKEN)");
      return;
    }
    
    if (!chatId || chatId === 'demo_user') {
      console.warn("❌ Отмена: ID получателя отсутствует или это тестовый проект (demo_user)");
      return;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      });
      const result = await response.json();
      console.log("📨 Ответ от Telegram:", result);
    } catch (err) {
      console.error('❌ Ошибка сети при обращении к Telegram API:', err);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectIdParam = params.get('project');

    if (projectIdParam) {
      setClientProjectId(projectIdParam);
      fetchSingleProject(projectIdParam);
      fetchComments(projectIdParam);
    } else {
      let currentUserId: string | null = null;
      const tg = window.Telegram?.WebApp;

      if (tg) {
        tg.ready();
        tg.expand();
        if (tg.initDataUnsafe?.user) {
          if (tg.initDataUnsafe.user.first_name) {
            setUserName(tg.initDataUnsafe.user.first_name);
          }
          if (tg.initDataUnsafe.user.id) {
            currentUserId = String(tg.initDataUnsafe.user.id);
            setUserId(currentUserId);
          }
        }
      }
      fetchProjects(currentUserId);
    }
  }, []);

  const fetchSingleProject = async (id: string) => {
    setLoading(true);
    try {
      const { data } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
      if (data) setClientProject(data as Project);
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (projectId: string) => {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (data) setComments(data as Comment[]);
  };

  const fetchProjects = async (uid: string | null) => {
    setLoading(true);
    let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (uid) query = query.eq('user_id', uid);

    const { data } = await query;
    if (data) setProjects(data as Project[]);
    setLoading(false);
  };

  const toggleComments = (projectId: string) => {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
      setComments([]);
    } else {
      setExpandedProjectId(projectId);
      fetchComments(projectId);
    }
  };

  const handleSendComment = async (author: 'client' | 'executor', targetProjectId: string) => {
    if (!newCommentText.trim() || sendingComment) return;

    setSendingComment(true);
    const textToSend = newCommentText.trim();

    const { data, error } = await supabase
      .from('comments')
      .insert([{ project_id: targetProjectId, author: author, text: textToSend }])
      .select();

    if (!error && data) {
      setComments([...comments, data[0] as Comment]);
      setNewCommentText('');

      // Уведомление исполнителю, если пишет клиент
      if (author === 'client' && clientProject) {
        const msg = `💬 <b>Новый комментарий по проекту "${clientProject.title}"</b>\n\n<i>"${textToSend}"</i>`;
        await sendTelegramNotification(clientProject.user_id, msg);
      }
    }
    setSendingComment(false);
  };

  const handleStatusChange = async (id: string, newStatus: Project['status']) => {
    const { error } = await supabase.from('projects').update({ status: newStatus }).eq('id', id);

    if (!error) {
      const targetProject = clientProject || projects.find((p) => p.id === id);

      if (clientProject) {
        setClientProject({ ...clientProject, status: newStatus });
      } else {
        setProjects(projects.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
      }

      if (targetProject && clientProject) {
        let message = '';
        if (newStatus === 'Done') {
          message = `✅ <b>Проект согласован!</b>\n\nЗаказчик принял проект: <b>${targetProject.title}</b>`;
        } else if (newStatus === 'Review') {
          message = `⚠️ <b>Проект возвращен на доработку</b>\n\nЗаказчик отправил на доработку: <b>${targetProject.title}</b>`;
        }
        if (message) await sendTelegramNotification(targetProject.user_id, message);
      }
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const { data, error } = await supabase
      .from('projects')
      .insert([{
          title: newTitle,
          client_name: newClient || 'Заказчик',
          status: 'In Progress',
          link: newLink || '#',
          user_id: userId || 'demo_user',
      }])
      .select();

    if (!error && data) {
      setProjects([data[0] as Project, ...projects]);
      setNewTitle('');
      setNewClient('');
      setNewLink('');
      setShowForm(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (!error) setProjects(projects.filter((p) => p.id !== id));
  };

  const handleCopyLink = (id: string) => {
    const shareUrl = `${APP_DOMAIN}/?project=${id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // ==================== РЕЖИМ КЛИЕНТА (по ссылке) ====================
  if (clientProjectId) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans flex flex-col justify-center items-center">
        <div className="w-full max-w-md bg-slate-800/90 border border-slate-700/60 rounded-2xl p-6 shadow-xl">
          <div className="text-center mb-6">
            <span className="text-xs uppercase tracking-widest text-indigo-400 font-semibold block mb-1">
              ClientFlow Portal
            </span>
            <h1 className="text-xl font-bold text-white">Согласование проекта</h1>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-20 bg-slate-700/50 rounded-xl"></div>
              <div className="h-10 bg-slate-700/50 rounded-xl"></div>
            </div>
          ) : !clientProject ? (
            <p className="text-center text-sm text-slate-300 py-6">Проект не найден.</p>
          ) : (
            <div className="space-y-5">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400 mb-1">Проект:</p>
                <h2 className="text-lg font-semibold text-white mb-3">{clientProject.title}</h2>
                <p className="text-xs text-slate-400 mb-1">Статус:</p>
                <span
                  className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
                    clientProject.status === 'Review'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : clientProject.status === 'Done'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  }`}
                >
                  {clientProject.status === 'Review' ? 'На согласовании' : clientProject.status === 'Done' ? 'Согласовано' : 'В работе'}
                </span>
              </div>

              {clientProject.link !== '#' && (
                <a
                  href={clientProject.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
                >
                  Открыть результат работы ↗
                </a>
              )}

              {/* Чат для клиента */}
              <div className="pt-2 border-t border-slate-700/60">
                <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">Комментарии и замечания</h3>
                
                <div className="space-y-2 max-h-48 overflow-y-auto mb-3 pr-1">
                  {comments.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-2">Комментариев пока нет</p>
                  ) : (
                    comments.map((c) => (
                      <div
                        key={c.id}
                        className={`p-3 rounded-xl text-xs ${
                          c.author === 'client'
                            ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 ml-4'
                            : 'bg-slate-700/50 border border-slate-600/40 text-slate-200 mr-4'
                        }`}
                      >
                        <p className="font-semibold text-[10px] text-slate-400 mb-1">
                          {c.author === 'client' ? 'Вы (Заказчик)' : 'Исполнитель'}
                        </p>
                        <p>{c.text}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Напишите комментарий..."
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleSendComment('client', clientProject.id)}
                    disabled={sendingComment}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-2 rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    Отправить
                  </button>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                {clientProject.status !== 'Done' ? (
                  <button
                    onClick={() => handleStatusChange(clientProject.id, 'Done')}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Принять и согласовать
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatusChange(clientProject.id, 'Review')}
                    className="w-full bg-amber-600/80 hover:bg-amber-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Вернуть на доработку
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== РЕЖИМ ИСПОЛНИТЕЛЯ (в Telegram) ====================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans">
      <header className="mb-6 flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">ClientFlow</h1>
          <p className="text-xs text-slate-400 mt-0.5">Портал исполнителя</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 block">Привет,</span>
          <span className="text-sm font-semibold text-indigo-400">{userName}</span>
        </div>
      </header>

      {!showForm ? (
        <main>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Проекты ({projects.length})
            </h2>
            <button
              onClick={() => setShowForm(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              + Новый
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500 text-center py-8">Загрузка проектов...</p>
          ) : projects.length === 0 ? (
            <div className="bg-slate-800/40 border border-dashed border-slate-700/60 rounded-xl p-8 text-center">
              <p className="text-sm text-slate-400 mb-1">Проектов пока нет</p>
              <p className="text-xs text-slate-500">Нажми «+ Новый», чтобы добавить первый</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div key={project.id} className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-base text-white pr-2">{project.title}</h3>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        project.status === 'Review'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : project.status === 'Done'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {project.status === 'Review' ? 'На согласовании' : project.status === 'Done' ? 'Согласовано' : 'В работе'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 mb-4">
                    <p>Заказчик: <span className="text-slate-200">{project.client_name}</span></p>
                  </div>

                  <div className="pt-3 border-t border-slate-700/40 flex justify-between items-center">
                    <div className="flex gap-3">
                      <button
                        onClick={() => toggleComments(project.id)}
                        className="text-xs font-medium bg-slate-700/50 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {expandedProjectId === project.id ? 'Скрыть чат' : 'Открыть чат'}
                      </button>
                      <button
                        onClick={() => handleCopyLink(project.id)}
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors px-1 py-1.5"
                      >
                        {copiedId === project.id ? '✓ Скопировано' : 'Ссылка клиенту'}
                      </button>
                    </div>

                    <button
                      onClick={() => handleDeleteProject(project.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      Удалить
                    </button>
                  </div>

                  {/* Чат для исполнителя (появляется при нажатии "Открыть чат") */}
                  {expandedProjectId === project.id && (
                    <div className="mt-4 pt-4 border-t border-slate-700/60">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">Чат с заказчиком</h3>
                      
                      <div className="space-y-2 max-h-48 overflow-y-auto mb-3 pr-1">
                        {comments.length === 0 ? (
                          <p className="text-xs text-slate-500 text-center py-2">Комментариев пока нет</p>
                        ) : (
                          comments.map((c) => (
                            <div
                              key={c.id}
                              className={`p-3 rounded-xl text-xs ${
                                c.author === 'executor'
                                  ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 ml-4'
                                  : 'bg-slate-700/50 border border-slate-600/40 text-slate-200 mr-4'
                              }`}
                            >
                              <p className="font-semibold text-[10px] text-slate-400 mb-1">
                                {c.author === 'executor' ? 'Вы' : 'Заказчик'}
                              </p>
                              <p>{c.text}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ответить..."
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => handleSendComment('executor', project.id)}
                          disabled={sendingComment}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-2 rounded-xl font-medium transition-colors disabled:opacity-50"
                        >
                          Отправить
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      ) : (
        <main className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-white">Новый проект</h2>
            <button onClick={() => setShowForm(false)} className="text-xs text-slate-400 hover:text-white">Отмена</button>
          </div>
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Название проекта *</label>
              <input type="text" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Имя заказчика</label>
              <input type="text" value={newClient} onChange={(e) => setNewClient(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Ссылка на результат</label>
              <input type="url" value={newLink} onChange={(e) => setNewLink(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors mt-2">Сохранить</button>
          </form>
        </main>
      )}
    </div>
  );
}