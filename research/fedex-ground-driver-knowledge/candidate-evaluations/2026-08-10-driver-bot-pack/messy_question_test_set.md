# Messy Driver Question Test Set

Last compiled: August 10, 2026

## How to use this file

- These are intentionally messy, incomplete, or slang-heavy driver prompts.
- Use them to test whether the bot:
- identifies the likely topic fast
- asks the smallest useful follow-up
- gives the correct next action
- avoids long policy-style answers

## Pass criteria

- The bot should not require the driver to know FedEx terminology first.
- The bot should ask options instead of broad open questions whenever possible.
- The bot should use `Quick mode` when the answer can be short.
- The bot should switch to `Guided mode` when one wrong choice could cause a delivery, compliance, or safety issue.

## Delivery and signature tests

1. `can i leave this one`
2. `nobody home`
3. `needs sig no one there`
4. `can front desk sign`
5. `can i leave with neighbor`
6. `customer says just leave it`
7. `scanner wants signature`
8. `this one needs id`
9. `can i leave alcohol package`
10. `is this direct sig or indirect`
11. `do i have to tag this door`
12. `can i leave in apartment lobby`
13. `mailroom said they'll take it`
14. `business closed can i leave it`
15. `what if no safe place to leave it`
16. `can i put it in mailbox`
17. `do i have to knock`
18. `customer wants back door`
19. `can i leave in locker`
20. `do i need a picture for this one`

## Status code tests

21. `what code do i use`
22. `what code for nobody home`
23. `wrong address code`
24. `cant find house code`
25. `customer refused code`
26. `weather code`
27. `what is 027`
28. `what is 100`
29. `002 or 003`
30. `004 or 007`
31. `014 or 019`
32. `029 or 106`
33. `what is 016`
34. `what is 079`
35. `what code for package not on van`
36. `what code for hold`
37. `what code for holiday`
38. `what code for no attempt`
39. `what code for security gate issue`
40. `what code for future delivery`

## Pickup tests

41. `pickup not ready`
42. `customer has no package`
43. `closed pickup`
44. `pickup wrong address`
45. `pickup cancelled`
46. `pickup not on my list`
47. `can i still take this pickup`
48. `hazmat pickup question`
49. `need pickup list`
50. `business says closed every friday`
51. `customer wants pickup moved`
52. `what pickup code do i use`
53. `resi pickup no one home`
54. `weather stopped pickup`
55. `express pickup cancelled`

## Call tag tests

56. `what do i do with this call tag`
57. `call tag pickup`
58. `call tag says fraud`
59. `how do i code this call tag`
60. `do i deliver or pickup this call tag`
61. `call tag not on list`

## FORGE tests

62. `forge wont log in`
63. `scanner not working`
64. `barcode wont scan`
65. `forge stuck`
66. `not syncing`
67. `need delayed login`
68. `how do i delayed login`
69. `package not on manifest`
70. `cant get pickup list`
71. `how do i change vehicles`
72. `camera scan on`
73. `what is this forge alert`
74. `need next stop nav`
75. `can i keep working if login is down`

## Safety and accident tests

76. `accident`
77. `i got hit`
78. `minor accident what now`
79. `do i call police`
80. `vehicle blocking road`
81. `what forms do i fill out`
82. `dog here`
83. `dog coming at me`
84. `dog bit me`
85. `road flooded`
86. `low bridge maybe too low`
87. `railroad crossing rules`
88. `stuck in snow`
89. `can i back out here`
90. `package fell and leaked`

## Security tests

91. `something feels off here`
92. `vehicle stolen`
93. `somebody broke into truck`
94. `unsafe stop`
95. `guy threatening me`
96. `can i record this on fedex property`
97. `forgot badge`
98. `lost badge`
99. `gun in parking lot`
100. `what do i do in active threat`

## Hazmat and restricted-package tests

101. `hazmat`
102. `can i take this hazmat`
103. `hazmat paperwork missing`
104. `hazmat leaking`
105. `dry ice package`
106. `dangerous goods prompt came up`
107. `can i take this to hawaii`
108. `call tag hazmat`
109. `tobacco package`
110. `vape package to house`

## Customer communication tests

111. `customer asking where package is`
112. `tracking says something else`
113. `customer wants it held`
114. `customer says deliver tomorrow`
115. `customer says no attempt today`
116. `customer says leave with office`
117. `customer says wrong address on label`
118. `customer says package was marked delivered but isnt there`
119. `need to message cpc`
120. `how do i tell them business closed`

## FedEx term recognition tests

121. `what is hal`
122. `what is rth`
123. `what is prc`
124. `what is cpc`
125. `what is fcc`
126. `what is fad`
127. `what is dvir`
128. `what is sra`
129. `what is op 200`
130. `what is op 201`
131. `what is ppod`
132. `what is ppoda`

## Not-sure tests

133. `not sure what this is`
134. `dont know what im looking at`
135. `dont know if i can leave it`
136. `not sure if its business or house`
137. `not sure if needs signature`
138. `not sure if hazmat`
139. `not sure what code this needs`
140. `not sure what this forge message means`

## Gold-standard response behaviors

- The bot should answer `can i leave this one` by narrowing to signature vs non-signature first.
- The bot should answer `002 or 003` by clearly distinguishing wrong label vs cannot locate.
- The bot should answer `dog here` by asking what the dog is doing.
- The bot should answer `hazmat` by asking what kind of hazmat issue it is.
- The bot should answer `what is hal` with a short clear term explanation, not a long paragraph.
- The bot should answer `forge wont log in` by distinguishing standard login issue vs delayed-login need.
