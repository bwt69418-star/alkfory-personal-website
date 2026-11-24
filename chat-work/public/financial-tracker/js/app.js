function showPage(pageId,button) {
    document.querySelectorAll('.page').forEach(p =>
        p.classList.remove('active-page')
    );
    document.querySelectorAll('.tab').forEach(t =>
        t.classList.remove('active')
    );
    document.getElementById(pageId).classList.add('active-page');
    button.classList.add('active');
}

// تم نقل معالجة إرسال النموذج إلى answers.js لمنع تعارض الأحداث.
