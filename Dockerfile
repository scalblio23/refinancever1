FROM nginx:alpine

# Copy site files
COPY index.html /usr/share/nginx/html/index.html
COPY quiz.html /usr/share/nginx/html/quiz.html
COPY hero.jpeg /usr/share/nginx/html/hero.jpeg

# Lender logos
COPY pepper.png /usr/share/nginx/html/pepper.png
COPY plenti.png /usr/share/nginx/html/plenti.png
COPY liberty.png /usr/share/nginx/html/liberty.png
COPY wisr.png /usr/share/nginx/html/wisr.png
COPY financeone.png /usr/share/nginx/html/financeone.png
COPY latitude.png /usr/share/nginx/html/latitude.png
COPY money3.png /usr/share/nginx/html/money3.png
COPY firstmac.png /usr/share/nginx/html/firstmac.png
COPY macquarie.png /usr/share/nginx/html/macquarie.png
COPY westpac.png /usr/share/nginx/html/westpac.png
COPY anz.png /usr/share/nginx/html/anz.png
COPY commbank.png /usr/share/nginx/html/commbank.png

# Custom nginx config so /quiz resolves to /quiz.html (clean URLs)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
