import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/widgets";

export default async function CareerRoadmap() {
  const user = await requireUser();
  const db = await getDb();
  
  const [goals, skills, allOpps] = await Promise.all([
    db.query(`SELECT title, description FROM goals WHERE user_id = ? AND status = 'active'`, [user.id]),
    db.query(`SELECT name, proficiency FROM skills WHERE user_id = ?`, [user.id]),
    db.query(`SELECT structured_json FROM opportunities WHERE user_id = ?`, [user.id]),
  ]);
  
  const requiredSkills = new Map<string, number>();
  for (const o of allOpps) {
    try {
      const parsed = JSON.parse(o.structured_json);
      if (parsed.skills_required && Array.isArray(parsed.skills_required)) {
        for (const req of parsed.skills_required) {
          requiredSkills.set(req, (requiredSkills.get(req) || 0) + 1);
        }
      }
    } catch (e) {}
  }
  
  const userSkillNames = new Set(skills.map(s => s.name.toLowerCase()));
  const missingSkills = Array.from(requiredSkills.entries())
    .filter(([name]) => !userSkillNames.has(name.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div>
      <PageHeader title="Career Roadmap" description="Skill gaps, target roles, and trajectory based on your goals and opportunities." />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
        <div className="space-y-6">
          <div className="p-6 border border-zinc-800 rounded-xl bg-zinc-900/50">
            <h3 className="text-lg font-medium mb-4">Target Goals</h3>
            {goals.length === 0 ? <p className="text-sm text-zinc-500">No active goals.</p> : (
              <ul className="space-y-2 text-sm text-zinc-300">
                {goals.map((g, i) => <li key={i}>• {g.title}</li>)}
              </ul>
            )}
          </div>
          
          <div className="p-6 border border-zinc-800 rounded-xl bg-zinc-900/50">
            <h3 className="text-lg font-medium mb-4">Current Strengths</h3>
            <div className="flex flex-wrap gap-2">
              {skills.slice(0, 15).map(s => (
                <span key={s.name} className="px-2 py-1 text-xs rounded bg-blue-900/30 text-blue-300 border border-blue-800/50">{s.name}</span>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-6 border border-zinc-800 rounded-xl bg-zinc-900/50">
          <h3 className="text-lg font-medium mb-4 text-orange-400">Identified Skill Gaps</h3>
          <p className="text-sm text-zinc-400 mb-6">Based on requirements from your tracked opportunities, you are missing these highly requested skills.</p>
          
          {missingSkills.length === 0 ? (
            <p className="text-sm text-zinc-500">No critical skill gaps identified.</p>
          ) : (
            <ul className="space-y-4">
              {missingSkills.map(([skill, count]) => (
                <li key={skill} className="flex justify-between items-center pb-2 border-b border-zinc-800/50">
                  <span className="text-sm font-medium text-zinc-300">{skill}</span>
                  <span className="text-xs text-zinc-500">Requested {count} times</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
