// ============================================================
// EduAgent 知识图谱种子数据
// 高等数学 + 大学物理 知识点及其关系
// ============================================================

// ── 清理旧数据 ─────────────────────────────────────────────
MATCH (n) DETACH DELETE n;

// ── 高等数学知识点 ─────────────────────────────────────────
CREATE (m1:KP {id: 'MATH-LIMIT-001', name: '数列极限', course_id: 'math', difficulty: 2, tags: '["极限","数列"]'})
CREATE (m2:KP {id: 'MATH-LIMIT-002', name: '函数极限', course_id: 'math', difficulty: 3, tags: '["极限","函数"]'})
CREATE (m3:KP {id: 'MATH-DIFF-001', name: '导数与微分', course_id: 'math', difficulty: 3, tags: '["微分","导数"]'})
CREATE (m4:KP {id: 'MATH-CALC-001', name: '不定积分', course_id: 'math', difficulty: 3, tags: '["积分"]'})
CREATE (m5:KP {id: 'MATH-CALC-002', name: '定积分', course_id: 'math', difficulty: 4, tags: '["积分","定积分"]'})
CREATE (m6:KP {id: 'MATH-CALC-003', name: '定积分的性质', course_id: 'math', difficulty: 3, tags: '["积分","性质"]'})
CREATE (m7:KP {id: 'MATH-SERIES-001', name: '数项级数', course_id: 'math', difficulty: 4, tags: '["级数"]'})
CREATE (m8:KP {id: 'MATH-SERIES-002', name: '幂级数', course_id: 'math', difficulty: 5, tags: '["级数","幂级数"]'})
CREATE (m9:KP {id: 'MATH-VEC-001', name: '向量代数', course_id: 'math', difficulty: 3, tags: '["向量"]'})
CREATE (m10:KP {id: 'MATH-DET-001', name: '行列式', course_id: 'math', difficulty: 4, tags: '["行列式","线代"]'})

// ── 大学物理知识点 ─────────────────────────────────────────
CREATE (p1:KP {id: 'PHY-MECH-001', name: '牛顿运动定律', course_id: 'physics', difficulty: 3, tags: '["力学","牛顿"]'})
CREATE (p2:KP {id: 'PHY-MECH-002', name: '做功与能量', course_id: 'physics', difficulty: 4, tags: '["力学","做功","能量"]'})
CREATE (p3:KP {id: 'PHY-MECH-003', name: '动能定理', course_id: 'physics', difficulty: 4, tags: '["力学","动能"]'})
CREATE (p4:KP {id: 'PHY-KIN-001', name: '运动学基本量', course_id: 'physics', difficulty: 2, tags: '["运动学","位移","速度"]'})
CREATE (p5:KP {id: 'PHY-KIN-002', name: '匀变速运动', course_id: 'physics', difficulty: 3, tags: '["运动学","加速度"]'})
CREATE (p6:KP {id: 'PHY-MOM-001', name: '动量守恒', course_id: 'physics', difficulty: 4, tags: '["力学","动量"]'})

// ── 课内前驱关系（PREREQUISITE）──────────────────────────
// 数列极限 → 函数极限 → 导数与微分 → 不定积分 → 定积分
CREATE (m1)-[:PREREQUISITE]->(m2)
CREATE (m2)-[:PREREQUISITE]->(m3)
CREATE (m3)-[:PREREQUISITE]->(m4)
CREATE (m4)-[:PREREQUISITE]->(m5)

// 定积分 ─包含─ 定积分的性质
CREATE (m5)-[:CONTAINS]->(m6)

// 数列极限 → 数项级数 → 幂级数
CREATE (m1)-[:PREREQUISITE]->(m7)
CREATE (m7)-[:PREREQUISITE]->(m8)

// 物理：运动学基本量 → 匀变速运动
CREATE (p4)-[:PREREQUISITE]->(p5)

// 物理：牛顿运动定律 → 做功与能量 → 动能定理
CREATE (p1)-[:PREREQUISITE]->(p2)
CREATE (p2)-[:PREREQUISITE]->(p3)

// 物理：牛顿运动定律 → 动量守恒
CREATE (p1)-[:PREREQUISITE]->(p6)

// ── 跨课程关联（CROSS_COURSE）── 核心创新！────────────────
// 定积分 ←→ 做功与能量：W = ∫F·ds
CREATE (m5)-[:CROSS_COURSE {description: '定积分在物理中的应用——做功公式 W=∫F·ds'}]->(p2)

// 导数与微分 ←→ 运动学基本量：v = dx/dt
CREATE (m3)-[:CROSS_COURSE {description: '微分描述瞬时变化率——速度=位移对时间的导数'}]->(p4)

// 定积分的性质 ←→ 牛顿运动定律：力的合成中的线性性
CREATE (m6)-[:CROSS_COURSE {description: '定积分的线性性质在力的合成中的应用'}]->(p1)

// 不定积分 ←→ 匀变速运动：对加速度积分得速度
CREATE (m4)-[:CROSS_COURSE {description: '不定积分求解匀变速运动——对加速度积分得速度公式'}]->(p5)

// 数项级数 ←→ 动能定理：级数方法在多质点系统能量求和中的应用
CREATE (m7)-[:CROSS_COURSE {description: '级数求和方法在多质点系统总动能计算中的应用'}]->(p3);
