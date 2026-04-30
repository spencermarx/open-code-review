import { describe, it, expect } from "vitest";
import {
  parseTeamConfigYaml,
  resolveTeamComposition,
  type ReviewerInstance,
} from "../team-config.js";

describe("parseTeamConfigYaml", () => {
  it("returns empty for missing default_team", () => {
    const { team } = parseTeamConfigYaml(`code-review-map:\n  agents:\n    flow_analysts: 2\n`);
    expect(team).toEqual([]);
  });

  it("parses Form 1 — shorthand (number)", () => {
    const { team } = parseTeamConfigYaml(`default_team:\n  security: 1\n`);
    expect(team).toEqual([
      {
        persona: "security",
        instance_index: 1,
        name: "security-1",
        model: null,
      },
    ]);
  });

  it("parses Form 2 — object with count + model", () => {
    const { team } = parseTeamConfigYaml(`
default_team:
  quality: { count: 2, model: claude-haiku-4-5-20251001 }
`);
    expect(team).toHaveLength(2);
    expect(team[0]).toEqual({
      persona: "quality",
      instance_index: 1,
      name: "quality-1",
      model: "claude-haiku-4-5-20251001",
    });
    expect(team[1]?.name).toBe("quality-2");
    expect(team[1]?.model).toBe("claude-haiku-4-5-20251001");
  });

  it("parses Form 3 — list of instance configs", () => {
    const { team } = parseTeamConfigYaml(`
default_team:
  principal:
    - { model: claude-opus-4-7 }
    - { model: claude-sonnet-4-6, name: principal-balanced }
`);
    expect(team).toHaveLength(2);
    expect(team[0]).toEqual({
      persona: "principal",
      instance_index: 1,
      name: "principal-1",
      model: "claude-opus-4-7",
    });
    expect(team[1]).toEqual({
      persona: "principal",
      instance_index: 2,
      name: "principal-balanced",
      model: "claude-sonnet-4-6",
    });
  });

  it("preserves backwards compatibility with prior single-number configs", () => {
    const { team } = parseTeamConfigYaml(`
default_team:
  principal: 2
  quality: 2
`);
    expect(team).toHaveLength(4);
    expect(team.map((i) => i.persona)).toEqual([
      "principal",
      "principal",
      "quality",
      "quality",
    ]);
    expect(team.every((i) => i.model === null)).toBe(true);
  });

  it("rejects mixing forms within an entry", () => {
    expect(() =>
      parseTeamConfigYaml(`
default_team:
  principal: { count: 2, instances: [{ model: claude-opus-4-7 }] }
`),
    ).toThrowError(/instances.*not allowed/);
  });

  it("rejects non-positive integer counts", () => {
    expect(() => parseTeamConfigYaml(`default_team:\n  security: 0\n`)).toThrow();
    expect(() => parseTeamConfigYaml(`default_team:\n  security: -1\n`)).toThrow();
    expect(() =>
      parseTeamConfigYaml(`default_team:\n  security: { count: 0 }\n`),
    ).toThrow();
  });

  it("rejects empty list-form entries", () => {
    expect(() => parseTeamConfigYaml(`default_team:\n  principal: []\n`)).toThrow();
  });

  it("expands user-defined aliases", () => {
    const { team } = parseTeamConfigYaml(`
models:
  aliases:
    workhorse: claude-sonnet-4-6
default_team:
  principal: { count: 2, model: workhorse }
`);
    for (const inst of team) {
      expect(inst.model).toBe("claude-sonnet-4-6");
    }
  });

  it("uses models.default when no instance/team model is set", () => {
    const { team } = parseTeamConfigYaml(`
models:
  default: claude-sonnet-4-6
default_team:
  quality: 2
`);
    for (const inst of team) {
      expect(inst.model).toBe("claude-sonnet-4-6");
    }
  });

  it("instance model overrides team model", () => {
    const { team } = parseTeamConfigYaml(`
default_team:
  principal:
    - { model: claude-opus-4-7 }
    - {}
`);
    expect(team[0]?.model).toBe("claude-opus-4-7");
    expect(team[1]?.model).toBeNull();
  });

  it("propagates resolved aliases through default_team list form", () => {
    const { team } = parseTeamConfigYaml(`
models:
  aliases:
    big-brain: claude-opus-4-7
    workhorse: claude-sonnet-4-6
default_team:
  principal:
    - { model: big-brain }
    - { model: workhorse }
`);
    expect(team[0]?.model).toBe("claude-opus-4-7");
    expect(team[1]?.model).toBe("claude-sonnet-4-6");
  });
});

describe("resolveTeamComposition", () => {
  const baseTeam: ReviewerInstance[] = [
    { persona: "principal", instance_index: 1, name: "principal-1", model: "claude-opus-4-7" },
    { persona: "principal", instance_index: 2, name: "principal-2", model: "claude-opus-4-7" },
    { persona: "quality", instance_index: 1, name: "quality-1", model: "claude-haiku-4-5-20251001" },
  ];

  it("returns the base team when no override is given", () => {
    expect(resolveTeamComposition(baseTeam)).toEqual(baseTeam);
  });

  it("returns the base team when override is empty", () => {
    expect(resolveTeamComposition(baseTeam, [])).toEqual(baseTeam);
  });

  it("replaces all instances of a persona referenced in the override", () => {
    const override: ReviewerInstance[] = [
      { persona: "principal", instance_index: 1, name: "principal-1", model: "claude-sonnet-4-6" },
    ];
    const resolved = resolveTeamComposition(baseTeam, override);
    expect(resolved.filter((i) => i.persona === "principal")).toHaveLength(1);
    expect(resolved.find((i) => i.persona === "principal")?.model).toBe("claude-sonnet-4-6");
    // Untouched personas pass through unchanged
    expect(resolved.find((i) => i.persona === "quality")?.model).toBe(
      "claude-haiku-4-5-20251001",
    );
  });

  it("can grow the count for a persona via override", () => {
    const override: ReviewerInstance[] = [
      { persona: "quality", instance_index: 1, name: "quality-1", model: "claude-opus-4-7" },
      { persona: "quality", instance_index: 2, name: "quality-2", model: "claude-haiku-4-5-20251001" },
      { persona: "quality", instance_index: 3, name: "quality-3", model: "claude-haiku-4-5-20251001" },
    ];
    const resolved = resolveTeamComposition(baseTeam, override);
    expect(resolved.filter((i) => i.persona === "quality")).toHaveLength(3);
  });
});
