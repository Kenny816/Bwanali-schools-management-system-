require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { supabase } = require('./supabaseClient');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ======================== MIDDLEWARE ========================
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Please log in to continue.' });
  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Authentication failed. Please try again.' });
  }
}

function canCreateRole(creatorRole, targetRole) {
  if (creatorRole === 'admin') return true;
  if (creatorRole === 'deputy' && ['hod','teacher','accountant','guidance'].includes(targetRole)) return true;
  if (creatorRole === 'hod' && targetRole === 'teacher') return true;
  return false;
}

// Tenant middleware
app.use(async (req, res, next) => {
  const sub = req.query.tenant || 'demo';
  const { data } = await supabase.from('tenants').select('*').eq('subdomain', sub).maybeSingle();
  req.tenant = data || { id:'11111111-1111-1111-1111-111111111111', name:'Demo School', subdomain:sub, type:'public' };
  req.tenantSub = sub;
  next();
});

// Paginated query helper
async function paginatedQuery(baseQuery, req) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';
  const sortBy = req.query.sortBy || 'created_at';
  const sortOrder = req.query.sortOrder || 'desc';
  let query = baseQuery;
  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,admission_no.ilike.%${search}%,name.ilike.%${search}%,title.ilike.%${search}%`);
  }
  const { count, error: countErr } = await query.select('*', { count: 'exact', head: true });
  if (countErr) return { data: [], error: countErr, total: 0, page, limit };
  const { data, error } = await query
    .select('*')
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range((page - 1) * limit, page * limit - 1);
  return { data, error, total: count, page, limit };
}

// ======================== PUBLIC ROUTES ========================
app.get('/', (req, res) => res.redirect('/login.html?tenant=' + req.tenantSub));

app.post('/api/auth/register-admin', async (req, res) => {
  const { email, password, fullName, schoolName, location, emis, schoolType } = req.body;
  if (!email || !password || !fullName || !schoolName || !schoolType) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }
  const sub = schoolName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'school-'+Date.now();
  const { error: tenantError } = await supabase.from('tenants').insert({
    name: schoolName, subdomain: sub, location: location||'', emis: emis||'', type: schoolType
  });
  if (tenantError) {
    if (tenantError.code === '23505') return res.status(400).json({ error: 'A school with that name already exists. Please log in instead.' });
    return res.status(400).json({ error: 'Could not create school. Please try again.' });
  }
  const { data: userData, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { role:'admin', full_name: fullName, tenant: sub, school_name: schoolName } }
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: userData.user, tenant: sub, schoolName: schoolName, type: schoolType });
});

app.post('/api/auth/signup', authMiddleware, async (req, res) => {
  const creatorRole = req.user.user_metadata?.role || 'teacher';
  const { email, password, role, fullName } = req.body;
  if (!canCreateRole(creatorRole, role)) return res.status(403).json({ error: 'You do not have permission to create this type of user.' });
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { role, full_name: fullName || email } }
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Invalid email or password. Please try again.' });
  const sub = data.user.user_metadata?.tenant || 'demo';
  const { data: tenant } = await supabase.from('tenants').select('type').eq('subdomain', sub).maybeSingle();
  res.json({
    token: data.session.access_token,
    user: { id: data.user.id, email: data.user.email, role: data.user.user_metadata?.role || 'teacher', fullName: data.user.user_metadata?.full_name, type: tenant?.type || 'private' }
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, role: req.user.user_metadata?.role, fullName: req.user.user_metadata?.full_name });
});

app.get('/api/tenant', (req, res) => res.json(req.tenant));
app.get('/api/tenants', async (req, res) => {
  const { data, error } = await supabase.from('tenants').select('*');
  if (error) return res.json([]);
  res.json(data || []);
});

// ======================== DASHBOARD ========================
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  const [students, staff] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id),
    supabase.from('staff').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id)
  ]);
  res.json({ stats: { students: students.count, staff: staff.count, attendance: '85%', feesCollected: 'ZMW 12,500' } });
});

app.get('/api/notifications/bell', authMiddleware, async (req, res) => {
  const { count } = await supabase.from('announcements').select('*', { count: 'exact', head: true })
    .eq('tenant_id', req.tenant.id)
    .gte('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString());
  res.json({ unread: (count || 0) });
});

// ======================== ENROLLMENTS ========================
app.get('/api/enrollments', authMiddleware, async (req, res) => {
  let base = supabase.from('students').select('*').eq('tenant_id', req.tenant.id);
  if (req.query.class_name) base = base.eq('class', req.query.class_name);
  const result = await paginatedQuery(base, req);
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json(result);
});

app.get('/api/enrollments/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('students')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenant.id)
    .single();
  if (error) return res.status(404).json({ error: 'Student not found.' });
  res.json(data);
});

app.post('/api/enrollments', authMiddleware, async (req, res) => {
  const admission_no = 'ADM-'+new Date().getFullYear()+'-'+Math.random().toString(36).substr(2,5).toUpperCase();
  const { data, error } = await supabase.from('students').insert({
    tenant_id: req.tenant.id, admission_no,
    first_name: req.body.firstName, last_name: req.body.lastName,
    class: req.body.className, section: req.body.section||'',
    gender: req.body.gender, dob: req.body.dob,
    religion: req.body.religion||'', nationality: req.body.nationality||'',
    home_language: req.body.homeLanguage||'', profile_picture: req.body.profilePicture||'',
    enrollment_date: req.body.enrollmentDate,
    parent_name: req.body.parentName, phone: req.body.phone, email: req.body.email, address: req.body.address,
    medical_notes: req.body.medicalNotes||'', dietary_notes: req.body.dietaryNotes||'',
    special_needs: req.body.specialNeeds||'', transport: req.body.transport||'',
    siblings: req.body.siblings||'', interests: req.body.interests||'',
    payment_mode: req.body.paymentMode||'', documents: req.body.documents||'',
    emergency_contact: req.body.emergencyContact||null,
    previous_schools: req.body.previousSchools||[],
    assessment: req.body.assessmentScheduled ? { scheduled:true, date:req.body.assessmentDate, subject:req.body.assessmentSubject } : null,
    processing_fee: req.body.processingFee||null
  }).select('*').single();
  if (error) return res.status(400).json({ error: error.message || 'Could not save student.' });
  res.status(201).json(data);
});

app.put('/api/enrollments/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('students').update({
    first_name: req.body.firstName, last_name: req.body.lastName,
    class: req.body.className, section: req.body.section,
    gender: req.body.gender, dob: req.body.dob,
    enrollment_date: req.body.enrollmentDate,
    parent_name: req.body.parentName, phone: req.body.phone, email: req.body.email, address: req.body.address,
    medical_notes: req.body.medicalNotes||'', special_needs: req.body.specialNeeds||'',
    profile_picture: req.body.profilePicture||''
  }).eq('id', req.params.id).eq('tenant_id', req.tenant.id).select('*').single();
  if (error) return res.status(404).json({ error: 'Student not found.' });
  res.json(data);
});

app.delete('/api/enrollments/:id', authMiddleware, async (req, res) => {
  await supabase.from('students').delete().eq('id', req.params.id).eq('tenant_id', req.tenant.id);
  res.json({ success: true });
});

// ======================== PROFILE PICTURE ========================
app.put('/api/enrollments/:id/profile-picture', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('students')
      .update({
        profile_picture: req.body.profile_picture || '',
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        phone: req.body.phone,
        email: req.body.email
      })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenant.id)
      .select('*')
      .single();

    if (error) {
      console.error('Profile picture update error:', error);
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (err) {
    console.error('Profile picture endpoint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ======================== CLASSES ========================
app.get('/api/classes', authMiddleware, async (req, res) => {
  let base = supabase.from('classes').select('*').eq('tenant_id', req.tenant.id);
  const result = await paginatedQuery(base, req);
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json(result);
});

app.post('/api/classes', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('classes').insert({...req.body, tenant_id: req.tenant.id}).select('*').single();
  if (error) return res.status(400).json({ error: 'Could not save class.' });
  res.status(201).json(data);
});

app.put('/api/classes/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('classes').update(req.body).eq('id', req.params.id).select('*').single();
  if (error) return res.status(404).json({ error: 'Class not found.' });
  res.json(data);
});

app.delete('/api/classes/:id', authMiddleware, async (req, res) => {
  await supabase.from('classes').delete().eq('id', req.params.id);
  res.json({ success: true });
});

app.get('/api/classes/:id/students', authMiddleware, async (req, res) => {
  const { data: classData } = await supabase.from('classes').select('*').eq('id', req.params.id).single();
  const { data: students } = await supabase.from('students').select('*').eq('class', classData.name).eq('tenant_id', req.tenant.id);
  res.json({ class: classData, students: students || [] });
});

// ======================== STAFF ========================
app.get('/api/staff', authMiddleware, async (req, res) => {
  let base = supabase.from('staff').select('*').eq('tenant_id', req.tenant.id);
  const result = await paginatedQuery(base, req);
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json(result);
});

app.post('/api/staff', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('staff').insert({...req.body, tenant_id: req.tenant.id}).select('*').single();
  if (error) return res.status(400).json({ error: 'Could not save staff.' });
  res.status(201).json(data);
});

app.put('/api/staff/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('staff').update(req.body).eq('id', req.params.id).select('*').single();
  if (error) return res.status(404).json({ error: 'Staff not found.' });
  res.json(data);
});

app.delete('/api/staff/:id', authMiddleware, async (req, res) => {
  await supabase.from('staff').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// ======================== COMMITTEES ========================
app.get('/api/committees', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('committees').select('*').eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/committees', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('committees').insert({
    name: req.body.name, description: req.body.description,
    positions: req.body.positions||[], members: req.body.members||[],
    tenant_id: req.tenant.id
  }).select('*').single();
  if (error) return res.status(400).json({ error: 'Could not save committee.' });
  res.status(201).json(data);
});

app.put('/api/committees/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('committees').update(req.body).eq('id', req.params.id).select('*').single();
  if (error) return res.status(404).json({ error: 'Committee not found.' });
  res.json(data);
});

app.delete('/api/committees/:id', authMiddleware, async (req, res) => {
  await supabase.from('committees').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// ======================== ASSESSMENTS ========================
app.get('/api/assessments', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('assessments').select('*').eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/assessments', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('assessments').insert({...req.body, tenant_id: req.tenant.id}).select('*').single();
  if (error) return res.status(400).json({ error: 'Could not save assessment.' });
  res.status(201).json(data);
});

app.put('/api/assessments/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('assessments').update(req.body).eq('id', req.params.id).select('*').single();
  if (error) return res.status(404).json({ error: 'Assessment not found.' });
  res.json(data);
});

app.delete('/api/assessments/:id', authMiddleware, async (req, res) => {
  await supabase.from('assessments').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// ======================== ATTENDANCE ========================
app.get('/api/attendance', authMiddleware, async (req, res) => {
  let q = supabase.from('attendance').select('*').eq('tenant_id', req.tenant.id);
  if (req.query.date) q = q.eq('date', req.query.date);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/attendance/batch', authMiddleware, async (req, res) => {
  const records = req.body.records.map(r => ({
    tenant_id: req.tenant.id, date: req.body.date,
    student_id: r.student_id, class_name: r.class_name,
    status: r.status, remarks: r.remarks||''
  }));
  const { data, error } = await supabase.from('attendance').insert(records).select('*');
  if (error) return res.status(400).json({ error: 'Could not save attendance.' });
  res.status(201).json(data);
});

// ======================== INVOICES & PAYMENTS ========================
app.get('/api/invoices', authMiddleware, async (req, res) => {
  let q = supabase.from('invoices').select('*').eq('tenant_id', req.tenant.id);
  if (req.query.student_id) q = q.eq('student_id', req.query.student_id);
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/invoices', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('invoices').insert({
    ...req.body, tenant_id: req.tenant.id, invoice_no: 'INV-'+Date.now()
  }).select('*').single();
  if (error) return res.status(400).json({ error: 'Could not create invoice.' });
  res.status(201).json(data);
});

app.post('/api/payments', authMiddleware, async (req, res) => {
  const { student_id, amount, payment_method, remarks, invoice_id } = req.body;
  if (!student_id || !amount) return res.status(400).json({ error: 'Student and amount required.' });
  const receipt = 'RCP' + Date.now();
  const paymentData = {
    tenant_id: req.tenant.id, student_id, amount,
    payment_method: payment_method || 'Cash',
    remarks: remarks || '', receipt_number: receipt,
    invoice_id: invoice_id || null
  };
  const { data: payment, error } = await supabase.from('payments').insert(paymentData).select('*').single();
  if (error) return res.status(400).json({ error: 'Could not record payment.' });
  if (invoice_id) {
    await supabase.from('invoices').update({ status: 'Paid' }).eq('id', invoice_id).eq('tenant_id', req.tenant.id);
  }
  res.status(201).json(payment);
});

// ======================== STUDENT PAYMENT SUMMARY & OUTSTANDING ========================
app.get('/api/students/:id/payments-summary', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('payments')
    .select('amount')
    .eq('student_id', req.params.id)
    .eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  const total = (data || []).reduce((s, p) => s + parseFloat(p.amount), 0);
  res.json({ total_paid: total, payments_count: data.length });
});

app.get('/api/students/:id/outstanding', authMiddleware, async (req, res) => {
  const { data: invoices } = await supabase.from('invoices')
    .select('total_amount, status')
    .eq('student_id', req.params.id)
    .eq('tenant_id', req.tenant.id);
  const unpaid = (invoices || []).filter(inv => inv.status !== 'Paid');
  const totalOutstanding = unpaid.reduce((s, inv) => s + parseFloat(inv.total_amount), 0);
  res.json({ outstanding: totalOutstanding, unpaid_count: unpaid.length });
});

// ======================== TRANSFER & EXPEL ========================
app.put('/api/enrollments/:id/transfer', authMiddleware, async (req, res) => {
  const { new_class, new_section, new_tenant_id } = req.body;
  const updateData = {};
  if (new_class) updateData.class = new_class;
  if (new_section !== undefined) updateData.section = new_section;
  if (new_tenant_id) updateData.tenant_id = new_tenant_id;
  const { data, error } = await supabase.from('students')
    .update(updateData)
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenant.id)
    .select('*')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.put('/api/enrollments/:id/expel', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('students')
    .update({ status: 'Expelled' })
    .eq('id', req.params.id)
    .eq('tenant_id', req.tenant.id)
    .select('*')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ======================== FEE TYPES ========================
app.get('/api/fee-types', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('fee_types').select('*').eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/fee-types', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('fee_types').insert({...req.body, tenant_id: req.tenant.id}).select('*').single();
  if (error) return res.status(400).json({ error: 'Could not save fee type.' });
  res.status(201).json(data);
});

app.delete('/api/fee-types/:id', authMiddleware, async (req, res) => {
  await supabase.from('fee_types').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// ======================== ANNOUNCEMENTS ========================
app.get('/api/announcements', authMiddleware, async (req, res) => {
  let q = supabase.from('announcements').select('*').eq('tenant_id', req.tenant.id);
  if (req.query.audience) q = q.or(`target_audience.eq.${req.query.audience},target_audience.eq.All`);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/announcements', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('announcements').insert({
    tenant_id: req.tenant.id, title: req.body.title, message: req.body.message,
    type: req.body.type||'General', target_audience: req.body.target_audience||'All',
    priority: req.body.priority||'Medium', labels: req.body.labels||''
  }).select('*').single();
  if (error) return res.status(400).json({ error: 'Could not save announcement.' });
  res.status(201).json(data);
});

// ======================== MONITORING ========================
app.get('/api/monitoring', authMiddleware, async (req, res) => {  try {    const { count: totalStudents } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id) || {};    const { count: totalStaff } = await supabase.from('staff').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id) || {};    const { count: totalClasses } = await supabase.from('classes').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id) || {};    const { count: totalCommittees } = await supabase.from('committees').select('*', { count: 'exact', head: true }).eq('tenant_id', req.tenant.id) || {};    const { data: payments } = await supabase.from('payments').select('amount').eq('tenant_id', req.tenant.id) || {};    const totalFees = (payments || []).reduce((s, p) => s + parseFloat(p.amount), 0);    const { data: recent } = await supabase.from('students').select('admission_no, first_name, last_name, enrollment_date').eq('tenant_id', req.tenant.id).order('created_at', { ascending: false }).limit(5) || {};    res.json({      stats: {        totalStudents: totalStudents || 0,        totalStaff: totalStaff || 0,        totalClasses: totalClasses || 0,        totalCommittees: totalCommittees || 0,        totalFees      },      classStudentCounts: [],      recentEnrollments: recent || []    });  } catch (err) {    console.error('Monitoring error:', err);    res.status(500).json({ error: 'Failed to load monitoring data' });  }});
app.get('/api/classes/student-counts', authMiddleware, async (req, res) => {
  const { data: classes } = await supabase.from('classes').select('name').eq('tenant_id', req.tenant.id);
  const counts = {};
  if (classes) {
    for (const c of classes) {
      const { count } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('class', c.name).eq('tenant_id', req.tenant.id);
      counts[c.name] = count || 0;
    }
  }
  res.json(counts);
});
app.get('/api/enrollments/class-summary', authMiddleware, async (req, res) => {
  const { data: students, error } = await supabase.from('students')
    .select('class, section')
    .eq('tenant_id', req.tenant.id);
  if (error) return res.status(500).json({ error: error.message });
  const classMap = {};
  (students || []).forEach(s => {
    const key = (s.class || 'Unassigned') + '||' + (s.section || '');
    if (!classMap[key]) classMap[key] = { name: s.class || 'Unassigned', section: s.section || '', count: 0 };
    classMap[key].count++;
  });
  const summary = Object.values(classMap).sort((a, b) => a.name.localeCompare(b.name));
  res.json(summary);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
