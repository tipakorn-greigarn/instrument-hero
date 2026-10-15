import { describe, expect, it } from 'vitest';
import { competitionBpm, points, tempoLevelById } from '../src/game/competition';
import { HIGH_SCORE_LIMIT, insertScore, rankFor, type HighScore } from '../src/storage';

function row(points: number, name = 'A'): HighScore {
  return { name, points, score: 90, grade: 'A', instrument: 'guitar', difficulty: 'normal', tempo: 'medium', date: '2026-10-15T00:00:00Z' };
}

describe('competition', () => {
  it('scales the song tempo by level', () => {
    expect(competitionBpm(80, 'slow')).toBe(60);
    expect(competitionBpm(80, 'medium')).toBe(80);
    expect(competitionBpm(80, 'fast')).toBe(100);
    expect(competitionBpm(85, 'slow')).toBe(64);
    expect(tempoLevelById('nope').id).toBe('medium');
  });

  it('awards points by accuracy, difficulty, and tempo', () => {
    expect(points(100, 'normal', 'medium')).toBe(1000);
    expect(points(100, 'easy', 'slow')).toBe(640);
    expect(points(100, 'hard', 'fast')).toBe(1563);
    expect(points(87.4, 'hard', 'medium')).toBe(1093);
  });
});

describe('high-score table', () => {
  it('ranks a run below equal scores already in the table', () => {
    const table = [row(900), row(800), row(800), row(500)];
    expect(rankFor(table, 950)).toBe(0);
    expect(rankFor(table, 800)).toBe(3);
    expect(rankFor(table, 100)).toBe(4);
  });

  it('keeps only the top ten', () => {
    let table: HighScore[] = [];
    for (let i = 1; i <= HIGH_SCORE_LIMIT; i++) table = insertScore(table, row(i * 100, `P${i}`)).table;
    expect(table).toHaveLength(HIGH_SCORE_LIMIT);
    expect(table[0].points).toBe(1000);

    const missed = insertScore(table, row(50));
    expect(missed.rank).toBeNull();
    expect(missed.table).toBe(table);

    const made = insertScore(table, row(550, 'New'));
    expect(made.rank).toBe(5);
    expect(made.table).toHaveLength(HIGH_SCORE_LIMIT);
    expect(made.table[5].name).toBe('New');
    expect(made.table[HIGH_SCORE_LIMIT - 1].points).toBe(200);
  });
});
