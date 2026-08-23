import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

interface Project {
  id: string;
  title: string;
  clientName: string;
  status: 'In Progress' | 'Review' | 'Done';
  link: string;
}

export default function App() {
  const [userName, setUserName] = useState<string>('Пользователь');
  const [projects, setProjects] = useState<Project[]>([
    {
      id: '1',
      title: 'Дизайн лендинга',
      clientName: 'Алексей',
      status: 'Review',
      link: 'https://figma.com',
    },
    {
      id: '2',
      title: 'Разработка Telegram-бота',
      clientName: 'Мария',
      status: 'In Progress',
      link: 'https://github.com',
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newLink, setNewLink] = useState('');

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();

    if (WebApp.initDataUnsafe?.user?.first_name) {
      setUserName(WebApp.initDataUnsafe.user.first_name);
    }
  }, []);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newProj: Project = {
      id: Date.now().toString(),
      title: newTitle,
      clientName: newClient || 'Заказчик',
      status: 'In Progress',
      link: newLink || '#',
    };

    setProjects([newProj, ...projects]);
    setNewTitle('');
    setNewClient('');
    setNewLink('');
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans select-none">
      {/* Шапка */}
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

      {/* Переключатель вида: Список / Форма */}
      {!showForm ? (
        <main>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Активные проекты ({projects.length})
            </h2>
            <button
              onClick={() => setShowForm(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              + Новый проект
            </button>
          </div>

          {/* Список карточек */}
          <div className="space-y-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-sm"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-base text-white">{project.title}</h3>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
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
                  </span>
                </div>

                <div className="text-xs text-slate-400 space-y-1 mt-3">
                  <p>Заказчик: <span className="text-slate-200">{project.clientName}</span></p>
                  {project.link !== '#' && (
                    <p className="truncate">
                      Ссылка:{' '}
                      <a
                        href={project.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 underline underline-offset-2"
                      >
                        {project.link}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      ) : (
        /* Форма создания проекта */
        <main className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-white">Создание проекта</h2>
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
                placeholder="Например: Редизайн сайта"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Имя или логин заказчика
              </label>
              <input
                type="text"
                placeholder="Например: @username"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Ссылка на результат (Figma, Notion, сайт)
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