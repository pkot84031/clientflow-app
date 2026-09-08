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

const APP_DOMAIN = 'https://clientflow-app-indol.vercel.app';

export default function App() {
  // === Подтягиваем токен из .env ===
  const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;

  const [userName, setUserName] = useState<string>('Пользователь');
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Режим клиента
  const [clientProjectId, setClientProjectId] = useState<string | null>(null);
  const [clientProject, setClientProject] = useState<Project | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Форма
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newLink, setNewLink] = useState('');

  // === Функция отправки уведомлений в Telegram ===
  const sendTelegramNotification = async (chatId: string | undefined, text: string) => {
    console.log("📢 Попытка отправить уведомление...");
    console.log("🔑 Токен:", BOT_TOKEN ? "На месте" : "ПУСТО! (Переменная не подхватилась)");
    console.log("👤 Telegram ID получателя:", chatId);

    if (!BOT_TOKEN || !chatId || chatId === 'demo_user') {
      console.warn("❌ Отмена: нет токена, нет ID или ID тестовый.");
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
      console.log("📨 Ответ от Telegram сервера:", result);
      
    } catch (err) {
      console.error('❌ Ошибка сети при отправке:', err);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectIdParam = params.get('project');

    if (projectIdParam) {
      setClientProjectId(projectIdParam);
      fetchSingleProject(projectIdParam);
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
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        setClientProject(data as Project);
      }
    } catch (err) {
      console.error('Ошибка загрузки проекта:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async (uid: string | null) => {
    setLoading(true);
    let query = supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (uid) {
      query = query.eq('user_id', uid);
    }

    const { data, error } = await query;

    if (!error && data) {
      setProjects(data as Project[]);
    }
    setLoading(false);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const { data, error } = await supabase
      .from('projects')
      .insert([
        {
          title: newTitle,
          client_name: newClient || 'Заказчик',
          status: 'In Progress',
          link: newLink || '#',
          user_id: userId || 'demo_user',
        },
      ])
      .select();

    if (!error && data) {
      setProjects([data[0] as Project, ...projects]);
      setNewTitle('');
      setNewClient('');
      setNewLink('');
      setShowForm(false);
    }
  };

  // === Обновленный handleStatusChange с вызовом уведомлений ===
  const handleStatusChange = async (id: string, newStatus: Project['status']) => {
    const { error } = await supabase
      .from('projects')
      .update({ status: newStatus })
      .eq('id', id);

    if (!error) {
      // Ищем проект, чтобы знать его название и кому отправлять
      const targetProject = clientProject || projects.find((p) => p.id === id);

      if (clientProject) {
        setClientProject({ ...clientProject, status: newStatus });
      } else {
        setProjects(
          projects.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
        );
      }

      // Если статус поменял клиент - отправляем сообщение исполнителю
      if (targetProject && clientProject) {
        let message = '';
        if (newStatus === 'Done') {
          message = `✅ <b>Проект согласован!</b>\n\nЗаказчик принял проект: <b>${targetProject.title}</b>`;
        } else if (newStatus === 'Review') {
          message = `⚠️ <b>Проект возвращен на доработку</b>\n\nЗаказчик нажал кнопку у проекта: <b>${targetProject.title}</b>`;
        }

        if (message) {
          await sendTelegramNotification(targetProject.user_id, message);
        }
      }
    }
  };

  const handleDeleteProject = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (!error) {
      setProjects(projects.filter((p) => p.id !== id));
    }
  };

  const handleCopyLink = (id: string) => {
    const shareUrl = `${APP_DOMAIN}/?project=${id}`;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          setCopiedId(id);
          setTimeout(() => setCopiedId(null), 2000);
        })
        .catch(() => fallbackCopy(shareUrl, id));
    } else {
      fallbackCopy(shareUrl, id);
    }
  };

  const fallbackCopy = (text: string, id: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      prompt('Скопируйте ссылку вручную:', text);
    }
  };

  // ==================== РЕЖИМ КЛИЕНТА ====================
  if (clientProjectId) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans select-none flex flex-col justify-center items-center">
        <div className="w-full max-w-md bg-slate-800/90 border border-slate-700/60 rounded-2xl p-6 shadow-xl">
          <div className="text-center mb-6">
            <span className="text-xs uppercase tracking-widest text-indigo-400 font-semibold block mb-1">
              ClientFlow Portal
            </span>
            <h1 className="text-xl font-bold text-white">Согласование проекта</h1>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-5">
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <div className="h-3 bg-slate-700/50 rounded w-1/4 mb-3"></div>
                <div className="h-6 bg-slate-700/50 rounded w-3/4 mb-6"></div>
                
                <div className="h-3 bg-slate-700/50 rounded w-1/4 mb-3"></div>
                <div className="h-4 bg-slate-700/50 rounded w-2/4 mb-6"></div>
                
                <div className="h-3 bg-slate-700/50 rounded w-1/4 mb-3"></div>
                <div className="h-6 bg-slate-700/50 rounded-full w-1/3"></div>
              </div>
              
              <div className="h-11 bg-slate-800/50 rounded-xl w-full border border-slate-700/50"></div>
              <div className="h-11 bg-slate-800/50 rounded-xl w-full border border-slate-700/50 mt-2"></div>
            </div>
          ) : !clientProject ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-300">Проект не найден или удален.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400 mb-1">Проект:</p>
                <h2 className="text-lg font-semibold text-white mb-3">{clientProject.title}</h2>

                <p className="text-xs text-slate-400 mb-1">Заказчик:</p>
                <p className="text-sm text-slate-200 mb-3">{clientProject.client_name}</p>

                <p className="text-xs text-slate-400 mb-1">Текущий статус:</p>
                <span
                  className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
                    clientProject.status === 'Review'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : clientProject.status === 'Done'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  }`}
                >
                  {clientProject.status === 'Review'
                    ? 'На согласовании'
                    : clientProject.status === 'Done'
                    ? 'Согласовано'
                    : 'В работе'}
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

  // ==================== РЕЖИМ ИСПОЛНИТЕЛЯ ====================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans select-none">
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
              + Новый проект
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500 text-center py-8">Загрузка проектов...</p>
          ) : projects.length === 0 ? (
            <div className="bg-slate-800/40 border border-dashed border-slate-700/60 rounded-xl p-8 text-center">
              <p className="text-sm text-slate-400 mb-1">Проектов пока нет</p>
              <p className="text-xs text-slate-500">Нажми «+ Новый проект», чтобы добавить первый</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-base text-white pr-2">{project.title}</h3>

                    <button
                      onClick={() =>
                        handleStatusChange(
                          project.id,
                          project.status === 'In Progress'
                            ? 'Review'
                            : project.status === 'Review'
                            ? 'Done'
                            : 'In Progress'
                        )
                      }
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-opacity active:opacity-75 ${
                        project.status === 'Review'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : project.status === 'Done'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {project.status === 'Review'
                        ? 'На согласовании'
                        : project.status === 'Done'
                        ? 'Согласовано'
                        : 'В работе'}
                    </button>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1 mt-3">
                    <p>Заказчик: <span className="text-slate-200">{project.client_name}</span></p>
                    {project.link !== '#' && (
                      <p className="truncate">
                        Ссылка:{' '}
                        <a
                          href={project.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-400 underline"
                        >
                          {project.link}
                        </a>
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-700/40 flex justify-between items-center">
                    <button
                      onClick={() => handleCopyLink(project.id)}
                      className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {copiedId === project.id ? '✓ Ссылка скопирована' : 'Скопировать ссылку для клиента'}
                    </button>

                    <button
                      onClick={() => handleDeleteProject(project.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      ) : (
        <main className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-white">Новый проект</h2>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Отмена
            </button>
          </div>

          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Название проекта *
              </label>
              <input
                type="text"
                required
                placeholder="Редизайн сайта"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Имя заказчика
              </label>
              <input
                type="text"
                placeholder="@username или имя"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Ссылка на результат
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors mt-2"
            >
              Сохранить проект
            </button>
          </form>
        </main>
      )}
    </div>
  );
}