const express = require('express');
const path = require('path');
const { supabaseAdmin } = require('./supabaseClient');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

function generateAdmissionNo() {
  const year = new Date().getFullYear();
  return `ADM-${year}-${Date.now().toString(36).toUpperCase()}`;
}
function generateInvoiceNumber() { return `INV-${Date.now()}`; }
function generateReceiptNumber() { return `RCP-${Date.now()}`; }

// Tenant middleware
app.use(async (req, res, next) => {
  const sub = req.query.tenant || 'greenfield';
  let tenant = null;
  try {
    const { data } = await supabaseAdmin.from('tenants').select('*').eq('subdomain', sub).maybeSingle();
    tenant = data;
  } catch (e) {}
  if (!tenant) {
    tenant = { id: '42465f6e-e9a4-4444-824d-97ce2404a0f2', name: 'Greenfield Academy', subdomain: sub, type: 'private' };
  }
  req.tenant = tenant;
  req.tenantSub = sub;
  next();
});

app.get('/', (req, res) => res.redirect(`/login.html?tenant=${req.tenantSub}`));

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'admin@school.com' && password === 'admin') {
    res.json({ success: true, token: 'mock-jwt', role: 'admin' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
});

app.get('/api/tenant', (req, res) => res.json(req.tenant));

// Dashboard stats
app.get('/api/dashboard', async (req, res) => {
  const [studentRes, staffRes] = await Promise.all([
    supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id),
    supabaseAdmin.from('staff').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id)
  ]);
  res.json({
    school: req.tenant.name,
    stats: {
      students: studentRes.count || 0,
      staff: staffRes.count || 0,
      attendance: '94%',
      feesCollected: 'K 1,200,000'
    }
  });
});

// ========== ENROLLMENT ==========
app.get('/api/enrollments', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('students').select('*').eq('tenant_id', req.tenant.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/enrollments', async (req, res) => {
  const admissionNo = generateAdmissionNo();
  const { data, error } = await supabaseAdmin.from('students').insert({
    tenant_id: req.tenant.id,
    admission_no: admissionNo,
    first_name: req.body.firstName,
    last_name: req.body.lastName,
    class: req.body.className,
    section: req.body.section || null,
    gender: req.body.gender || null,
    dob: req.body.dob || null,
    enrollment_date: req.body.enrollmentDate || new Date().toISOString().split('T')[0],
    parent_name: req.body.parentName || null,
    phone: req.body.phone || null,
    email: req.body.email || null,
    address: req.body.address || null,
    previous_schools: req.body.previousSchools || [],
    assessment: {
      scheduled: req.body.assessmentScheduled || false,
      date: req.body.assessmentDate || null,
      subject: req.body.assessmentSubject || ''
    },
    processing_fee: req.body.processingFee || null
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/enrollments/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('students').update({
    first_name: req.body.firstName,
    last_name: req.body.lastName,
    class: req.body.className,
    section: req.body.section,
    gender: req.body.gender,
    dob: req.body.dob,
    enrollment_date: req.body.enrollmentDate,
    parent_name: req.body.parentName,
    phone: req.body.phone,
    email: req.body.email,
    address: req.body.address,
    previous_schools: req.body.previousSchools || [],
    assessment: {
      scheduled: req.body.assessmentScheduled || false,
      date: req.body.assessmentDate || null,
      subject: req.body.assessmentSubject || ''
    },
    processing_fee: req.body.processingFee || null
  }).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/enrollments/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('students').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== CLASSES ==========
app.get('/api/classes', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('classes').select('*').eq('tenant_id', req.tenant.id).order('numeric_order', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/classes', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('classes').insert({
    tenant_id: req.tenant.id,
    name: req.body.name,
    numeric_order: req.body.numeric_order || null,
    section: req.body.section || null,
    capacity: req.body.capacity || 40,
    class_teacher: req.body.class_teacher || null
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/classes/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('classes').update({
    name: req.body.name,
    numeric_order: req.body.numeric_order,
    section: req.body.section,
    capacity: req.body.capacity,
    class_teacher: req.body.class_teacher
  }).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/classes/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('classes').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get('/api/classes/:id/students', async (req, res) => {
  const { data: classData, error: classError } = await supabaseAdmin.from('classes').select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  if (classError) return res.status(404).json({ error: 'Class not found' });
  let query = supabaseAdmin.from('students').select('*').eq('tenant_id', req.tenant.id).eq('class', classData.name);
  if (classData.section) query = query.eq('section', classData.section);
  const { data: students, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ class: classData, students: students || [] });
});

// ========== STAFF ==========
app.get('/api/staff', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('staff').select('*').eq('tenant_id', req.tenant.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/staff', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('staff').insert({
    tenant_id: req.tenant.id,
    first_name: req.body.firstName,
    last_name: req.body.lastName,
    role: req.body.role,
    department: req.body.department || null,
    phone: req.body.phone || null,
    email: req.body.email || null,
    joining_date: req.body.joiningDate || null,
    salary: req.body.salary || null
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/staff/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('staff').update({
    first_name: req.body.firstName,
    last_name: req.body.lastName,
    role: req.body.role,
    department: req.body.department,
    phone: req.body.phone,
    email: req.body.email,
    joining_date: req.body.joiningDate,
    salary: req.body.salary
  }).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/staff/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('staff').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== COMMITTEES ==========
app.get('/api/committees', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('committees').select('*').eq('tenant_id', req.tenant.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/committees', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('committees').insert({
    tenant_id: req.tenant.id,
    name: req.body.name,
    description: req.body.description || null,
    chairperson: req.body.chairperson || null,
    members: req.body.members || null
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/committees/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('committees').update({
    name: req.body.name,
    description: req.body.description,
    chairperson: req.body.chairperson,
    members: req.body.members
  }).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/committees/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('committees').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== ATTENDANCE ==========
app.get('/api/attendance', async (req, res) => {
  const { date, class: className, section } = req.query;
  if (!date) return res.status(400).json({ error: 'Date is required' });
  let studentQuery = supabaseAdmin.from('students').select('*').eq('tenant_id', req.tenant.id);
  if (className) { studentQuery = studentQuery.eq('class', className); if (section) studentQuery = studentQuery.eq('section', section); }
  const { data: students, error: studentsError } = await studentQuery;
  if (studentsError) return res.status(500).json({ error: studentsError.message });
  const { data: records, error: attError } = await supabaseAdmin.from('attendance').select('student_id, status, remarks').eq('tenant_id', req.tenant.id).eq('attendance_date', date);
  if (attError) return res.status(500).json({ error: attError.message });
  const map = {}; (records || []).forEach(a => { map[a.student_id] = { status: a.status, remarks: a.remarks }; });
  const result = students.map(s => ({ ...s, attendance: map[s.id] || { status: 'Present', remarks: '' } }));
  res.json({ students: result });
});

app.post('/api/attendance', async (req, res) => {
  const { date, records } = req.body;
  if (!date || !Array.isArray(records)) return res.status(400).json({ error: 'Invalid payload' });
  const upserts = records.map(r => ({
    tenant_id: req.tenant.id,
    student_id: r.student_id,
    attendance_date: date,
    status: r.status,
    remarks: r.remarks || null
  }));
  const { error } = await supabaseAdmin.from('attendance').upsert(upserts, { onConflict: 'student_id, attendance_date' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== MONITORING ==========
app.get('/api/monitoring', async (req, res) => {
  const tenantId = req.tenant.id;
  const [studentRes, staffRes, classesRes, committeesRes] = await Promise.all([
    supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabaseAdmin.from('staff').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabaseAdmin.from('classes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabaseAdmin.from('committees').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
  ]);
  const { data: students } = await supabaseAdmin.from('students').select('processing_fee').eq('tenant_id', tenantId).not('processing_fee', 'is', null);
  let totalFees = 0;
  (students || []).forEach(s => { if (s.processing_fee?.paid && s.processing_fee?.amount) totalFees += parseFloat(s.processing_fee.amount); });
  const { data: recentEnrollments } = await supabaseAdmin.from('students').select('admission_no, first_name, last_name, enrollment_date').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5);
  const { data: classes } = await supabaseAdmin.from('classes').select('name, section').eq('tenant_id', tenantId);
  const classStudentCounts = [];
  if (classes) {
    for (const c of classes) {
      let query = supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('class', c.name);
      if (c.section) query = query.eq('section', c.section);
      const { count } = await query;
      classStudentCounts.push({ className: c.name + (c.section ? ` (${c.section})` : ''), students: count || 0 });
    }
  }
  res.json({
    stats: {
      totalStudents: studentRes.count || 0,
      totalStaff: staffRes.count || 0,
      totalClasses: classesRes.count || 0,
      totalCommittees: committeesRes.count || 0,
      totalFees: `K ${totalFees.toLocaleString()}`
    },
    recentEnrollments: recentEnrollments || [],
    classStudentCounts
  });
});

// ========== TEACHER MONITORING ==========
app.get('/api/teacher-monitoring', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { data: teachers, error } = await supabaseAdmin.from('staff').select('*').eq('tenant_id', tenantId).ilike('role', '%teacher%').order('first_name');
    if (error) return res.status(500).json({ error: error.message });
    const teacherDetails = [];
    for (const teacher of teachers) {
      const fullName = `${teacher.first_name} ${teacher.last_name}`;
      const { data: classes } = await supabaseAdmin.from('classes').select('name, section, capacity').eq('tenant_id', tenantId).eq('class_teacher', fullName);
      let totalStudents = 0;
      const classList = [];
      if (classes) {
        for (const c of classes) {
          let query = supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('class', c.name);
          if (c.section) query = query.eq('section', c.section);
          const { count } = await query;
          totalStudents += count || 0;
          classList.push({ name: c.name + (c.section ? ` (${c.section})` : ''), students: count || 0 });
        }
      }
      teacherDetails.push({ id: teacher.id, name: fullName, phone: teacher.phone, email: teacher.email, classes: classList, totalStudents });
    }
    const totalTeachers = teacherDetails.length;
    const totalStudentsTaught = teacherDetails.reduce((sum, t) => sum + t.totalStudents, 0);
    const avg = totalTeachers ? (totalStudentsTaught / totalTeachers).toFixed(1) : 0;
    res.json({ stats: { totalTeachers, totalStudentsTaught, avgStudentsPerTeacher: avg }, teachers: teacherDetails });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== ASSESSMENTS ==========
app.get('/api/assessments', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('assessments').select('*').eq('tenant_id', req.tenant.id).order('date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/assessments', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('assessments').insert({
    tenant_id: req.tenant.id,
    name: req.body.name,
    type: req.body.type || 'Exam',
    date: req.body.date || null,
    subject: req.body.subject || null,
    class: req.body.class,
    section: req.body.section || null,
    max_score: req.body.max_score || 100
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/assessments/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('assessments').update({
    name: req.body.name,
    type: req.body.type,
    date: req.body.date,
    subject: req.body.subject,
    class: req.body.class,
    section: req.body.section,
    max_score: req.body.max_score
  }).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/assessments/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('assessments').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get('/api/assessments/:id/marks', async (req, res) => {
  const { data: assessment, error: aError } = await supabaseAdmin.from('assessments').select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  if (aError) return res.status(404).json({ error: 'Assessment not found' });
  let studentQuery = supabaseAdmin.from('students').select('*').eq('tenant_id', req.tenant.id).eq('class', assessment.class);
  if (assessment.section) studentQuery = studentQuery.eq('section', assessment.section);
  const { data: students, error: studentsError } = await studentQuery;
  if (studentsError) return res.status(500).json({ error: studentsError.message });
  const { data: marks, error: marksError } = await supabaseAdmin.from('marks').select('student_id, score, remarks').eq('tenant_id', req.tenant.id).eq('assessment_id', assessment.id);
  if (marksError) return res.status(500).json({ error: marksError.message });
  const marksMap = {}; (marks || []).forEach(m => { marksMap[m.student_id] = { score: m.score, remarks: m.remarks }; });
  const result = students.map(s => ({ ...s, mark: marksMap[s.id] || { score: '', remarks: '' } }));
  res.json({ assessment, students: result });
});

app.post('/api/assessments/:id/marks', async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'Invalid records' });
  const upserts = records.map(r => ({
    tenant_id: req.tenant.id,
    assessment_id: req.params.id,
    student_id: r.student_id,
    score: r.score || null,
    remarks: r.remarks || null
  }));
  const { error } = await supabaseAdmin.from('marks').upsert(upserts, { onConflict: 'assessment_id, student_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== RESULTS ==========
app.get('/api/results', async (req, res) => {
  const { class: className, section } = req.query;
  if (!className) return res.status(400).json({ error: 'Class is required' });
  let studentQuery = supabaseAdmin.from('students').select('*').eq('tenant_id', req.tenant.id).eq('class', className);
  if (section) studentQuery = studentQuery.eq('section', section);
  const { data: students, error: studentsError } = await studentQuery;
  if (studentsError) return res.status(500).json({ error: studentsError.message });
  let assessmentQuery = supabaseAdmin.from('assessments').select('*').eq('tenant_id', req.tenant.id).eq('class', className);
  if (section) assessmentQuery = assessmentQuery.eq('section', section);
  const { data: assessments, error: assessmentsError } = await assessmentQuery;
  if (assessmentsError) return res.status(500).json({ error: assessmentsError.message });
  if (!assessments || assessments.length === 0) {
    return res.json({ students: students.map(s => ({ ...s, totalScore: 0, average: 0, totalMax: 0 })), assessments: [], totalMaxPossible: 0 });
  }
  const assessmentIds = assessments.map(a => a.id);
  const { data: marks, error: marksError } = await supabaseAdmin.from('marks').select('student_id, assessment_id, score').eq('tenant_id', req.tenant.id).in('assessment_id', assessmentIds);
  if (marksError) return res.status(500).json({ error: marksError.message });
  const studentScores = {};
  students.forEach(s => { studentScores[s.id] = { totalObtained: 0, totalMax: 0, name: s.first_name + ' ' + s.last_name, admission_no: s.admission_no }; });
  const assessmentMaxMap = {};
  assessments.forEach(a => { assessmentMaxMap[a.id] = a.max_score; });
  (marks || []).forEach(m => {
    if (studentScores[m.student_id] && m.score !== null) {
      studentScores[m.student_id].totalObtained += parseFloat(m.score);
    }
  });
  const totalMaxPossible = assessments.reduce((sum, a) => sum + parseFloat(a.max_score), 0);
  const results = students.map(s => {
    const data = studentScores[s.id];
    const avg = totalMaxPossible > 0 ? ((data.totalObtained / totalMaxPossible) * 100).toFixed(1) : 0;
    return { ...s, totalScore: data.totalObtained, average: avg, totalMax: totalMaxPossible };
  });
  res.json({ students: results, assessments, totalMaxPossible });
});

app.get('/api/students/:id/marks', async (req, res) => {
  const { data: student, error: studentError } = await supabaseAdmin.from('students').select('*').eq('id', req.params.id).eq('tenant_id', req.tenant.id).single();
  if (studentError) return res.status(404).json({ error: 'Student not found' });
  let query = supabaseAdmin.from('assessments').select('*').eq('tenant_id', req.tenant.id).eq('class', student.class);
  if (student.section) query = query.eq('section', student.section);
  const { data: assessments, error: assessmentsError } = await query;
  if (assessmentsError) return res.status(500).json({ error: assessmentsError.message });
  const { data: marks, error: marksError } = await supabaseAdmin.from('marks').select('assessment_id, score, remarks').eq('tenant_id', req.tenant.id).eq('student_id', student.id);
  if (marksError) return res.status(500).json({ error: marksError.message });
  const marksMap = {};
  (marks || []).forEach(m => { marksMap[m.assessment_id] = { score: m.score, remarks: m.remarks }; });
  const detailedMarks = assessments.map(a => ({
    assessmentName: a.name,
    type: a.type,
    subject: a.subject,
    date: a.date,
    maxScore: a.max_score,
    score: marksMap[a.id]?.score ?? null,
    remarks: marksMap[a.id]?.remarks ?? ''
  }));
  res.json({ student, marks: detailedMarks });
});

// ========== ACCOUNTS ==========
app.get('/api/fee-types', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('fee_types').select('*').eq('tenant_id', req.tenant.id).order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/fee-types', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('fee_types').insert({
    tenant_id: req.tenant.id,
    name: req.body.name,
    description: req.body.description,
    default_amount: req.body.default_amount
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/fee-types/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('fee_types').update({
    name: req.body.name,
    description: req.body.description,
    default_amount: req.body.default_amount
  }).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/fee-types/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('fee_types').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/invoices/generate', async (req, res) => {
  const { student_id, fee_type_ids, due_date } = req.body;
  if (!student_id || !fee_type_ids || !Array.isArray(fee_type_ids)) return res.status(400).json({ error: 'Missing student_id or fee_type_ids' });
  const { data: student, error: studentError } = await supabaseAdmin.from('students').select('*').eq('id', student_id).single();
  if (studentError) return res.status(404).json({ error: 'Student not found' });
  const { data: feeTypes, error: feeTypesError } = await supabaseAdmin.from('fee_types').select('*').in('id', fee_type_ids);
  if (feeTypesError) return res.status(500).json({ error: feeTypesError.message });
  if (!feeTypes.length) return res.status(400).json({ error: 'No valid fee types' });
  const invoiceNumber = generateInvoiceNumber();
  let totalAmount = 0;
  const items = [];
  for (const ft of feeTypes) {
    const amount = ft.default_amount || 0;
    totalAmount += amount;
    items.push({ fee_type_id: ft.id, description: ft.name, amount });
  }
  const { data: invoice, error: invError } = await supabaseAdmin.from('invoices').insert({
    tenant_id: req.tenant.id,
    invoice_number: invoiceNumber,
    student_id,
    due_date,
    total_amount: totalAmount,
    status: 'Unpaid'
  }).select().single();
  if (invError) return res.status(500).json({ error: invError.message });
  const itemInserts = items.map(i => ({ invoice_id: invoice.id, fee_type_id: i.fee_type_id, description: i.description, amount: i.amount }));
  const { error: itemsError } = await supabaseAdmin.from('invoice_items').insert(itemInserts);
  if (itemsError) return res.status(500).json({ error: itemsError.message });
  res.status(201).json(invoice);
});

app.get('/api/invoices', async (req, res) => {
  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('*, students(first_name, last_name, admission_no)')
    .eq('tenant_id', req.tenant.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(invoices);
});

app.get('/api/invoices/:id', async (req, res) => {
  const { data: invoice, error } = await supabaseAdmin.from('invoices').select('*, students(first_name, last_name, admission_no)').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Invoice not found' });
  const { data: items } = await supabaseAdmin.from('invoice_items').select('*').eq('invoice_id', invoice.id);
  const { data: payments } = await supabaseAdmin.from('payments').select('*').eq('invoice_id', invoice.id);
  res.json({ ...invoice, items: items || [], payments: payments || [] });
});

app.post('/api/payments', async (req, res) => {
  const { invoice_id, amount, payment_method, remarks } = req.body;
  if (!invoice_id || !amount) return res.status(400).json({ error: 'Missing invoice_id or amount' });
  const { data: invoice, error: invError } = await supabaseAdmin.from('invoices').select('*').eq('id', invoice_id).single();
  if (invError) return res.status(404).json({ error: 'Invoice not found' });
  const receiptNumber = generateReceiptNumber();
  const { data: payment, error: payError } = await supabaseAdmin.from('payments').insert({
    tenant_id: req.tenant.id,
    invoice_id,
    amount,
    payment_method,
    payment_date: new Date().toISOString().split('T')[0],
    receipt_number: receiptNumber,
    remarks
  }).select().single();
  if (payError) return res.status(500).json({ error: payError.message });
  const { data: totalPaid } = await supabaseAdmin.from('payments').select('amount').eq('invoice_id', invoice_id);
  const totalPaidAmount = totalPaid.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  let newStatus = 'Unpaid';
  if (totalPaidAmount >= invoice.total_amount) newStatus = 'Paid';
  else if (totalPaidAmount > 0) newStatus = 'Partial';
  await supabaseAdmin.from('invoices').update({ status: newStatus }).eq('id', invoice_id);
  res.status(201).json(payment);
});

app.get('/api/finance-summary', async (req, res) => {
  const { data: invoices, error } = await supabaseAdmin.from('invoices').select('total_amount, status').eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount), 0);
  const { data: payments } = await supabaseAdmin.from('payments').select('amount').eq('tenant_id', req.tenant.id);
  const totalCollected = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const outstanding = totalInvoiced - totalCollected;
  res.json({ totalInvoiced, totalCollected, outstanding, invoiceCount: invoices.length });
});

// ========== NOTIFICATIONS ==========
app.get('/api/notifications', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('notifications').select('*').eq('tenant_id', req.tenant.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/notifications', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('notifications').insert({
    tenant_id: req.tenant.id,
    title: req.body.title,
    message: req.body.message,
    type: req.body.type || 'General',
    target_audience: req.body.target_audience || null,
    priority: req.body.priority || 'Medium',
    labels: req.body.labels || ''
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/notifications/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('notifications').update({
    title: req.body.title,
    message: req.body.message,
    type: req.body.type,
    target_audience: req.body.target_audience,
    priority: req.body.priority,
    labels: req.body.labels
  }).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/notifications/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('notifications').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Bwanali running at http://localhost:${PORT}`);
  console.log(`   → http://localhost:${PORT}/?tenant=greenfield\n`);
});
