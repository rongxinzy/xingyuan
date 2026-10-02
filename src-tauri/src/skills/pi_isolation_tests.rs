use super::list_skills_from;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("xingyuan-pi-skills-{}-{stamp}", std::process::id()));
        std::fs::create_dir(&root).unwrap();
        Self(root)
    }

    fn skill(&self, relative: &str, name: &str) -> PathBuf {
        let file = self.0.join(relative).join(name).join("SKILL.md");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(
            &file,
            format!("---\nname: {name}\ndescription: Test {name}\n---\n"),
        )
        .unwrap();
        file
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn uses_application_pi_skills_without_discovering_old_global_roots() {
    let fixture = Fixture::new();
    fixture.skill("home/.pi/agent/skills", "old-agent-only");
    fixture.skill("home/.pi/skills", "old-home-only");
    let owned = fixture.skill("app/pi/agent/skills", "owned-skill");
    fixture.skill("project/.pi/skills", "project-skill");
    let skills = list_skills_from(
        &fixture.0.join("project"),
        Some(&fixture.0.join("home")),
        Some(&fixture.0.join("app/pi/agent")),
        None,
    );
    assert_eq!(skills.len(), 2);
    let skill = skills
        .iter()
        .find(|skill| skill.name == "owned-skill")
        .unwrap();
    assert_eq!(Path::new(&skill.path), owned);
    assert_eq!(skill.scope, "user");
    assert_eq!(skill.source, "pi");
    assert!(skills.iter().any(|skill| skill.name == "project-skill"));
}

#[test]
fn missing_application_directory_does_not_fall_back_to_user_pi() {
    let fixture = Fixture::new();
    fixture.skill("home/.pi/agent/skills", "old-only");
    fixture.skill("home/.pi/skills", "old-home-only");
    for app_dir in [None, Some(fixture.0.join("missing/pi/agent"))] {
        let skills = list_skills_from(
            &fixture.0.join("project"),
            Some(&fixture.0.join("home")),
            app_dir.as_deref(),
            None,
        );
        assert!(skills.is_empty());
    }
}

#[test]
fn project_precedence_and_disabled_fallback_use_owned_pi_directory() {
    let fixture = Fixture::new();
    let project_file = fixture.skill("project/.pi/skills", "review");
    let owned_file = fixture.skill("app/pi/agent/skills", "review");
    fixture.skill("home/.pi/agent/skills", "review");
    let project = fixture.0.join("project");
    let home = fixture.0.join("home");
    let agent = fixture.0.join("app/pi/agent");
    let enabled = list_skills_from(&project, Some(&home), Some(&agent), None);
    assert_eq!(enabled.len(), 1);
    assert_eq!(Path::new(&enabled[0].path), project_file);
    let disabled = [crate::fs::path_to_js(&project_file)];
    let fallback = list_skills_from(&project, Some(&home), Some(&agent), Some(&disabled));
    assert_eq!(fallback.len(), 1);
    assert_eq!(Path::new(&fallback[0].path), owned_file);
    let both = [disabled[0].clone(), crate::fs::path_to_js(&owned_file)];
    assert!(list_skills_from(&project, Some(&home), Some(&agent), Some(&both)).is_empty());
}
