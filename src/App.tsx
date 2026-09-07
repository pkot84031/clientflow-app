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
}

export default function App() {
  const [userName, setUserName] = useState<string>('Пользователь');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newLink, setNewLink] = useState('');

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.initDataUnsafe?.user?.first_name) {
        setUserName(tg.initDataUnsafe.user.first_name);
      }
    }

    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

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

  // Изменение статуса проекта
  const handleStatusChange = async (id: string, currentStatus: Project['status']) => {
    const statusMap: Record<Project['status'], Project['status']> = {
      'In Progress': 'Review',
      'Review': 'Done',
      'Done': 'In Progress',
    };

    const nextStatus = statusMap[currentStatus];

    const { error } = await supabase
      .from('projects')
      .update({ status: nextStatus })
      .eq('id', id);

    if (!error) {
      setProjects(
        projects.map((p) => (p.id === id ? { ...p, status: nextStatus } : p))
      );
    }
  };

  // Удаление проекта
  const handleDeleteProject = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);

    if (!error) {
      setProjects(projects.filter((p) => p.id !== id));
    }
  };

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
                    
                    {/* Кнопка смены статуса */}
                    <button
                      onClick={() => handleStatusChange(project.id, project.status)}
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

                  {/* Кнопка удаления */}
                  <div className="mt-3 pt-3 border-t border-slate-700/40 flex justify-end">
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